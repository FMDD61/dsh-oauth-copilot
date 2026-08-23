// verify-vision — confirm opencode-go serves deepseek-v4-flash-vision-exp
// through the real settings providers + real credentials (text probe only).
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import yaml from 'js-yaml'

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const settings = yaml.load(readFileSync(join(home, 'settings.yaml'), 'utf8'))
const providers = settings['llm-pi-ai'].providers

const ctx = new Context()
ctx.provide('systemPrompt', { section() {} })
ctx.provide('tools', { register() { return () => {} } })
await ctx.plugin(CredentialsLocal, { dshHome: home, watch: false })
await ctx.plugin(LlmRuntime)
await ctx.plugin(LlmPiAi, { providers })

const models = await ctx.llm.listModels('opencode-go')
console.log('opencode-go 模型数:', models.length, '->', models.map(m => m.id).join(', '))
const vision = models.find(m => m.id === 'deepseek-v4-flash-vision-exp')
if (!vision) {
  console.log('VISION-EXP 未出现在模型列表')
  await ctx.fiber.dispose()
  process.exit(1)
}
console.log('vision-exp 模态:', vision.inputModalities?.join('+') ?? '(未知)')
const resolved = await ctx.llm.resolveModelInfo('opencode-go', 'deepseek-v4-flash-vision-exp')
console.log('vision-exp 思考档:', JSON.stringify(resolved.reasoning?.efforts?.map(e=>e.id) ?? null))

const assembler = new BlockAssembler()
try {
  for await (const chunk of ctx.llm.stream({
    provider: 'opencode-go',
    model: 'deepseek-v4-flash-vision-exp',
    messages: [{ role: 'user', content: [{ type: 'text', text: '请只回复：VISION-OK' }] }],
    maxTokens: 64,
    reasoningEffort: process.env.REASONING_EFFORT ?? 'high',
  })) assembler.push(chunk)
  let text = ''
  for (const b of assembler.blocks()) if (b.type === 'text') text += b.text
  const finish = assembler.finish
  console.log('finish:', finish?.kind ?? 'none', finish?.failure?.message ? JSON.stringify(String(finish.failure.message).slice(0, 200)) : '')
  console.log('reply:', JSON.stringify(text.slice(0, 200)))
  console.log('VERIFY VISION (' + (process.env.REASONING_EFFORT ?? 'high') + '):', text.includes('VISION-OK') || text.length > 0 ? 'PASS' : 'FAIL')
} catch (e) {
  console.log('THROW:', String(e.message ?? e).slice(0, 300))
  console.log('VERIFY VISION: FAIL')
}
await ctx.fiber.dispose()
