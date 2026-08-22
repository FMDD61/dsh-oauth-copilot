import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createGitHubCopilotAdapter } from './adapter.js'
import { GITHUB_COPILOT_PROVIDER_ID } from './constants.js'
import type {} from './global.js'
import { registerLoginTools } from './login-tool.js'

export { createGitHubCopilotAdapter } from './adapter.js'
export { authContextFrom, credentialStoreFrom } from './credential-store.js'
export { registerLoginTools, type LoginToolOptions } from './login-tool.js'
export { GITHUB_COPILOT_PROVIDER_ID, GITHUB_COPILOT_RECORD_KEY } from './constants.js'

export const name = 'llm-github-copilot'
// authorization is intentionally NOT a hard inject: dsh-base 0.1.1-rc.2 does
// not mount the dsh-authorization service, so a hard dependency would fail the
// whole plugin tree at boot. The login tools register via ctx.inject() and
// appear only when the service is actually present; the model route below
// always activates.
export const inject = ['llm', 'tools', 'credentials', 'systemPrompt']

const ConfigObject = z.object({
  loginWindowMs: z.number().int().min(1_000).max(3_600_000).default(180_000),
  streamIdleTimeoutMs: z.number().int().min(1_000).max(2_147_483_647).default(300_000),
})
export const Config = z.preprocess(value => value ?? {}, ConfigObject)
export type Config = z.input<typeof ConfigObject>

function copilotGuidance(): string[] {
  return [
    'The user may ask how to use / connect GitHub Copilot in dsh. The web Models page has no Copilot login button; the intended path is:',
    '1. Ask whether to sign in, then call `github_copilot_login` (pass `enterpriseUrl` only for GitHub Enterprise).',
    '2. It prints a verification URL and a code — show BOTH to the user, and wait while they authorize in the browser.',
    '3. After success, the user picks a model under the GitHub Copilot provider in the model picker.',
    'Use `github_copilot_status` to report grant expiry and available models; `github_copilot_logout` removes the local grant. Always tell the user these tools exist when they ask about Copilot access.',
  ]
}

export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config.parse(config)
  // The dsh 0.1.1-rc.2 loader mounts this package twice in one tree: once as
  // the bundle entry, once via the bundle patch's `insert llm-github-copilot`
  // entry. Registration must be idempotent or the second apply fails with
  // DUPLICATE_ADAPTER and takes the whole plugin tree down.
  const already = ctx.llm.listProviders().some(entry => entry.id === GITHUB_COPILOT_PROVIDER_ID)
  if (!already) {
    const disposeAdapter = ctx.llm.registerAdapter(
      [GITHUB_COPILOT_PROVIDER_ID],
      createGitHubCopilotAdapter(ctx, resolved.streamIdleTimeoutMs),
    )
    ctx.effect(() => {
      return () => {
        disposeAdapter()
      }
    }, 'dsh-oauth-copilot: github-copilot route')
  }

  ctx.inject(['authorization'], () => {
    const disposeTools = registerLoginTools(ctx, { loginWindowMs: resolved.loginWindowMs })
    if (disposeTools !== undefined) {
      ctx.systemPrompt.section({
        name: 'tool:github-copilot',
        order: 191,
        text: copilotGuidance(),
      })
      ctx.effect(() => {
        return () => {
          disposeTools()
        }
      }, 'dsh-oauth-copilot: login tools')
    }
  })
}

export default { name, inject, Config, apply }
