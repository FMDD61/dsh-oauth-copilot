// Integration smoke: mount the plugin against the real credentials/authorization/llm seams
// in an isolated temp DSH_HOME. No running web instance is touched.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import Authorization from '@deepseek-ai/dsh-authorization'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import Copilot from '../lib/index.js'

const home = mkdtempSync(join(tmpdir(), 'dsh-copilot-smoke-'))
const ctx = new Context()
const tools = []
ctx.provide('systemPrompt', { section() {} })
ctx.provide('tools', {
  register(tool) {
    tools.push(tool.name)
    return () => { const i = tools.indexOf(tool.name); if (i >= 0) tools.splice(i, 1) }
  },
},
)

await ctx.plugin(CredentialsLocal, { dshHome: home, watch: false })
await ctx.plugin(Authorization)
await ctx.plugin(LlmRuntime)
await ctx.plugin(Copilot, { enableModelTools: true })

const providers = ctx.llm.listProviders()
const models = await ctx.llm.listModels('github-copilot')
console.log('providers:', JSON.stringify(providers))
console.log('tools:', tools.join(', '))
console.log('github-copilot model count:', models.length)
console.log('sample models:', models.slice(0, 6).map(m => m.id).join(', '))

// credential seam round trip: write a grant record, read through our store, delete
const { credentialKey } = await import('@deepseek-ai/dsh-credentials')
const key = credentialKey('llm-pi-ai', 'github-copilot')
const grant = {
  type: 'oauth',
  access: 'tid=t-smoke;exp=1800000;proxy-ep=proxy.individual.githubcopilot.com',
  refresh: 'smoke-refresh',
  expires: Date.now() + 60_000,
  availableModelIds: ['gpt-5.5'],
}
await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: grant }))
const { credentialStoreFrom, authContextFrom } = await import('../lib/credential-store.js')
const store = credentialStoreFrom(ctx)
const read = await store.read()
console.log('store.read type:', read?.type, '| models:', read?.availableModelIds?.join(','))
const envVal = await authContextFrom(ctx).env('NODE_VERSION')
console.log('authContext.env(NODE_VERSION) resolved:', envVal !== undefined)
await ctx.credentials.deleteRecord(key)
console.log('store.read after delete:', await store.read())

await ctx.fiber.dispose()
console.log('SMOKE OK')
