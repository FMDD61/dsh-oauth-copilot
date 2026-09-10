import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import {
  resolveRetryPolicy,
  type GenerateOptions,
  type PreparedAdapterCall,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { GITHUB_COPILOT_PROVIDER_ID } from './constants.js'
import { authContextFrom, credentialStoreFrom } from './credential-store.js'

/**
 * pi-ai's github-copilot dynamic-header pass calls `msg.content.some(...)`,
 * which throws on string content. Normalize every message to the array shape
 * before the request reaches pi-ai.
 */
export function normalizeStringContent<T extends { content: unknown }>(messages: readonly T[]): T[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: [{ type: 'text' as const, text: message.content }],
      } as T
    }
    return message
  })
}

/**
 * PiAiAdapter that canonicalizes string message content to the block-array
 * shape pi-ai's GitHub Copilot header handling requires. The harness dispatch
 * path goes through `prepareCall()` (which closes over the internal stream),
 * so both entry points must be wrapped.
 */
class NormalizedPiAiAdapter extends PiAiAdapter {
  override prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return super.prepareCall(provider, model, signal).then((call) => ({
      ...call,
      stream: (options: GenerateOptions) => call.stream({
        ...options,
        messages: normalizeStringContent(options.messages),
      }),
    }))
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return super.stream({
      ...options,
      messages: normalizeStringContent(options.messages),
    })
  }
}

/**
 * Register the github-copilot route backed by pi-ai's Copilot catalog. The
 * request-level apiKey resolves to undefined on purpose: authentication then
 * comes from the provider's native OAuth auth, which the injected credential
 * store feeds from the harness grant record — so pi-ai's refresh and
 * available-model filtering both work out of the box.
 */
export function createGitHubCopilotAdapter(ctx: Context, streamIdleTimeoutMs: number): PiAiAdapter {
  // dsh 0.1.5-rc.1 made `modelErrors` a required member of the resolved profile
  // (`PiAiAdapter.modelOf` reads it before dispatch). Without it the whole
  // github-copilot catalog fails with "Cannot read properties of undefined
  // (reading 'get')". The field is additive, so older 0.1.x hosts ignore it.
  const profile: ResolvedPiAiProviderProfile = {
    provider: GITHUB_COPILOT_PROVIDER_ID,
    displayName: 'GitHub Copilot',
    streamIdleTimeoutMs,
    maxRequestImageBytes: 20_971_520,
    requestImagePixelBudget: 4_194_304,
    requestImageMaxBytes: 1_048_576,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-oauth-copilot retryPolicy'),
    configuredMaxTokens: new Map(),
    modelErrors: new Map(),
    piProvider: githubCopilotProvider(),
  }
  const profiles = new Map<string, ResolvedPiAiProviderProfile>([[GITHUB_COPILOT_PROVIDER_ID, profile]])
  return new NormalizedPiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => undefined,
    auth: {
      credentials: credentialStoreFrom(ctx),
      authContext: authContextFrom(ctx),
    },
    resolveAttachments: () => ctx.get('attachments'),
  })
}