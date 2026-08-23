// diag-live — two-probe diagnosis: raw pi-ai stream vs adapter stream.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import { createModels } from '@earendil-works/pi-ai'
import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot'
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

async function probe(provider, model, maxTokens) {
  console.log(`\n== probe ${provider}/${model} (maxTokens=${maxTokens}) ==`)
  const text = []
  const events = []
  try {
    const stream = await ctx.llm.stream({
      provider, model, maxTokens,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: COPILOT-OK' }] }],
    })
    const assembler = new BlockAssembler()
    for await (const chunk of stream) assembler.push(chunk)
    for (const b of assembler.blocks()) if (b.type === 'text') text.push(b.text)
    const finish = assembler.finish
    console.log('adapter finish:', finish?.kind ?? 'none',
      finish?.failure?.message ? JSON.stringify(String(finish.failure.message).slice(0, 160)) : '')
    console.log('adapter text:', JSON.stringify(text.join('').slice(0, 120)))
  } catch (e) {
    console.log('adapter THROW:', String(e.message ?? e).slice(0, 200))
  }
  // raw pi-ai probe through the same store
  try {
    const models = createModels({ credentials: store, authContext: { env: async () => undefined, fileExists: async () => false } })
    models.setProvider(githubCopilotProvider())
    const stream = models.streamSimple(
      { provider: 'github-copilot', model },
      { systemPrompt: '', messages: [{ role: 'user', content: 'Reply with exactly: COPILOT-OK' }] },
      { maxTokens },
    )
    const collected = []
    for await (const evt of stream) {
      collected.push(evt.type)
      if (evt.type === 'text_delta') text.push(evt.delta)
      if (evt.type === 'error') {
        const e = evt.error
        const detail = { message: e?.message, name: e?.name, code: e?.code, status: e?.status, errType: e?.type, cause: e?.cause?.message ?? e?.cause?.constructor?.name }
        console.log('pi-ai ERROR:', JSON.stringify(detail))
        if (e?.response) { try { console.log('  body:', JSON.stringify(JSON.parse(e.response.text ?? '{}')).slice(0,300)) } catch { console.log('  body(raw):', String(e.response.text ?? '').slice(0,300)) } }
      }
    }
    console.log('pi-ai event types:', [...new Set(collected)].slice(0, 12).join(','))
    console.log('pi-ai text:', JSON.stringify(text.join('').slice(-120)))
  } catch (e) {
    console.log('pi-ai THROW:', String(e.message ?? e).slice(0, 200))
  }
}

await probe('github-copilot', 'gpt-5.6-luna', 128)
await probe('github-copilot', 'gpt-4.1', 128)
await ctx.fiber.dispose()
