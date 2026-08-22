// Integration smoke WITHOUT the authorization service (dsh-base 0.1.1-rc.2 reality):
// the plugin must still activate (route + credential seams), only the login tools stay out.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import Copilot from '../lib/index.js'

const home = mkdtempSync(join(tmpdir(), 'dsh-copilot-noauth-'))
const ctx = new Context()
const tools = []
ctx.provide('systemPrompt', { section() {} })
ctx.provide('tools', {
  register(tool) {
    tools.push(tool.name)
    return () => { const i = tools.indexOf(tool.name); if (i >= 0) tools.splice(i, 1) }
  },
})

await ctx.plugin(CredentialsLocal, { dshHome: home, watch: false })
await ctx.plugin(LlmRuntime)
await ctx.plugin(Copilot, {})

const providers = ctx.llm.listProviders()
const models = await ctx.llm.listModels('github-copilot')
console.log('providers:', JSON.stringify(providers))
console.log('tools registered (expect none):', JSON.stringify(tools))
console.log('github-copilot model count:', models.length)
await ctx.fiber.dispose()
console.log('SMOKE-NOAUTH OK')
