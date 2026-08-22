import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createGitHubCopilotAdapter } from './adapter.js'
import { GITHUB_COPILOT_PROVIDER_ID } from './constants.js'
import { registerLoginTools } from './login-tool.js'

export { createGitHubCopilotAdapter } from './adapter.js'
export { authContextFrom, credentialStoreFrom } from './credential-store.js'
export { registerLoginTools, type LoginToolOptions } from './login-tool.js'
export { GITHUB_COPILOT_PROVIDER_ID, GITHUB_COPILOT_RECORD_KEY } from './constants.js'

export const name = 'llm-github-copilot'
export const inject = ['llm', 'tools', 'credentials', 'authorization']

const ConfigObject = z.object({
  loginWindowMs: z.number().int().min(1_000).max(3_600_000).default(180_000),
  streamIdleTimeoutMs: z.number().int().min(1_000).max(2_147_483_647).default(300_000),
})
export const Config = z.preprocess(value => value ?? {}, ConfigObject)
export type Config = z.input<typeof ConfigObject>

export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config.parse(config)
  const disposeTools = registerLoginTools(ctx, { loginWindowMs: resolved.loginWindowMs })
  const disposeAdapter = ctx.llm.registerAdapter(
    [GITHUB_COPILOT_PROVIDER_ID],
    createGitHubCopilotAdapter(ctx, resolved.streamIdleTimeoutMs),
  )
  ctx.effect(() => {
    return () => {
      disposeTools()
      disposeAdapter()
    }
  }, 'dsh-oauth-copilot: login tools and github-copilot route')
}

export default { name, inject, Config, apply }
