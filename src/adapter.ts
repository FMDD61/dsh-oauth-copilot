import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import { resolveRetryPolicy, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
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
 * shape pi-ai's GitHub Copilot header handling requires.
 */
class NormalizedPiAiAdapter extends PiAiAdapter {
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
  const profile: ResolvedPiAiProviderProfile = {
    provider: GITHUB_COPILOT_PROVIDER_ID,
    displayName: 'GitHub Copilot',
    streamIdleTimeoutMs,
    maxRequestImageBytes: 20_971_520,
    requestImagePixelBudget: 4_194_304,
    requestImageMaxBytes: 1_048_576,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-oauth-copilot retryPolicy'),
    configuredMaxTokens: new Map(),
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