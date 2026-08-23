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
  // Sign-in/out tools are OFF by default: an untrusted model (e.g. a
  // non-official LLM with prompt injection) must not be able to start a
  // device-code authorization or drop the grant (security review V4). The
  // manual CLI (scripts/dsh-copilot-auth.mjs) is the primary path; opt in
  // with enableModelTools: true only when the deployment trusts its model.
  enableModelTools: z.boolean().default(false),
  loginWindowMs: z.number().int().min(1_000).max(3_600_000).default(180_000),
  streamIdleTimeoutMs: z.number().int().min(1_000).max(2_147_483_647).default(300_000),
})
export const Config = z.preprocess(value => value ?? {}, ConfigObject)
export type Config = z.input<typeof ConfigObject>

function copilotGuidance(): string[] {
  return [
    'The user may ask how to use / connect GitHub Copilot in dsh. The web Models page has no Copilot login button.',
    'The intended primary path is the MANUAL CLI (run by the human in a terminal): `dsh-copilot-auth login` (installed with the package; local dev: `node scripts/dsh-copilot-auth.mjs login`) — it prints a verification URL and code; the human authorizes in the browser, and the CLI stores the grant. Use `... status` and `... logout` the same way.',
    'Only when the deployment opted into model tools (`enableModelTools: true`) may you call `github_copilot_login` / `github_copilot_status` / `github_copilot_logout`; the login tool only supports github.com (enterprise domains are CLI-only). Otherwise tell the user to run the CLI above.',
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

  // Guidance is installed unconditionally so the model always knows how to
  // point the user at the manual CLI; model-executable tools stay off unless
  // explicitly enabled.
  ctx.systemPrompt.section({
    name: 'tool:github-copilot',
    order: 191,
    text: copilotGuidance(),
  })

  if (!resolved.enableModelTools) return

  ctx.inject(['authorization'], () => {
    const disposeTools = registerLoginTools(ctx, { loginWindowMs: resolved.loginWindowMs })
    if (disposeTools !== undefined) {
      ctx.effect(() => {
        return () => {
          disposeTools()
        }
      }, 'dsh-oauth-copilot: login tools')
    }
  })
}

export default { name, inject, Config, apply }
