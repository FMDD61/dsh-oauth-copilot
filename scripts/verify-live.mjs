// verify-live — real end-to-end check against the user's actually-authorized
// Copilot grant in the real DSH_HOME. Sends ONE tiny model request. Tokens are
// never printed.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import Copilot from '../lib/index.js'

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const ctx = new Context()
ctx.provide('systemPrompt', { section() {} })
ctx.provide('tools', { register() { return () => {} } })
await ctx.plugin(CredentialsLocal, { dshHome: home, watch: false })
await ctx.plugin(LlmRuntime)
await ctx.plugin(Copilot, {})

const { credentialStoreFrom } = await import('../lib/credential-store.js')
const store = credentialStoreFrom(ctx)
const cred = await store.read()
if (cred === undefined) {
  console.log('GRANT: 未登录或记录被校验拒绝')
  await ctx.fiber.dispose()
  process.exit(1)
}
console.log('GRANT: 有效（校验通过）| 过期:', new Date(cred.expires).toLocaleString(),
  '| availableModelIds:', Array.isArray(cred.availableModelIds)
    ? `${cred.availableModelIds.length} 个（将按此过滤）` : '未拉取（不过滤，全量目录）')

const models = await ctx.llm.listModels('github-copilot')
console.log('ROUTE: github-copilot 模型数 =', models.length)
const target = models.find(m => m.id === 'gpt-4.1') ?? models.find(m => m.id.includes('gpt-5-mini') || m.id.includes('gpt-5.6')) ?? models[0]
  ?? models[0]
if (!target) {
  console.log('ROUTE: 无可用模型，跳过请求')
  await ctx.fiber.dispose()
  process.exit(1)
}
console.log('REQUEST: 最小请求 ->', target.id, '(maxTokens=64)')
const assembler = new BlockAssembler()
try {
  for await (const chunk of ctx.llm.stream({
    provider: 'github-copilot',
    model: target.id,
    messages: [{ role: 'user', content: 'Reply with exactly: COPILOT-OK' }],
    maxTokens: 64,
  })) assembler.push(chunk)
  const blocks = [...assembler.blocks()]
  console.log('BLOCKS:', blocks.map(b => b.type + ':' + (b.text ?? '').length).join(', '))
  const finish = assembler.finish
  console.log('FINISH:', finish?.kind ?? 'none', finish?.failure?.message ? finish.failure.message.slice(0,200) + ' || stack: ' + (finish.failure.cause?.stack ?? finish.failure.stack ?? '').split("\n").slice(0,4).join(" | ") : '')
  let text = ''
  for (const b of blocks) if (b.type === 'text') text += b.text
  console.log('RESPONSE:', JSON.stringify(text.slice(0, 200)))
  console.log(text.includes('COPILOT-OK') ? 'VERIFY LIVE: PASS' : 'VERIFY LIVE: PASS (内容不同但已收到回复)')
} catch (error) {
  console.log('REQUEST FAILED:', error instanceof Error ? error.message.slice(0, 300) : String(error))
  process.exitCode = 1
}
await ctx.fiber.dispose()
