import { credentialKey } from '@deepseek-ai/dsh-credentials'

/** pi-ai provider id and harness route key for GitHub Copilot. */
export const GITHUB_COPILOT_PROVIDER_ID = 'github-copilot'

/**
 * The credential record this plugin and dsh-llm-pi-ai's authorization flow
 * both write. The scope is the LLM adapter plugin's registered name, so the
 * stored grant payload follows pi-ai's credential format.
 */
export const GITHUB_COPILOT_RECORD_KEY = credentialKey('llm-pi-ai', GITHUB_COPILOT_PROVIDER_ID)
