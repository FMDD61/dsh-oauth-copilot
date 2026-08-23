import type { AuthContext, Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, isCredentialRefName, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { GITHUB_COPILOT_RECORD_KEY } from './constants.js'

/**
 * Strict validation of a stored Copilot grant before it is trusted (V3 of the
 * security review): a forged record pointing `proxy-ep` at an attacker host
 * would redirect every request (prompts included) to the attacker's server.
 * Records that fail validation are ignored — treated as not signed in — and
 * never sent to pi-ai.
 */
function validatePiCredential(value: unknown): value is Credential {
  if (typeof value !== 'object' || value === null) return false
  const cred = value as Record<string, unknown>
  if (cred.type !== 'oauth') return false
  if (typeof cred.access !== 'string' || cred.access.length === 0) return false
  if (typeof cred.refresh !== 'string' || cred.refresh.length === 0) return false
  if (typeof cred.expires !== 'number') return false
  if (cred.availableModelIds !== undefined && !Array.isArray(cred.availableModelIds)) return false
  // proxy-ep must be the official endpoint ONLY. Previously the record's own
  // `enterpriseUrl` was accepted as an alternaive host, but a forger controls
  // that field too (self-consistent forgery): an attacker could write
  // proxy-ep=proxy.attacker.example + enterpriseUrl=attacker.example and pass.
  // Model tooling already refuses enterprise hosts; enterprise sign-in is a
  // CLI-only, user-explicitly-confirmed path whose grants this plugin ignores.
  const proxyMatch = /(?:^|;)proxy-ep=([^;]+)/.exec(cred.access)
  if (proxyMatch === null) return false
  try {
    const host = new URL(`https://${proxyMatch[1]}`).hostname
    if (host !== 'proxy.individual.githubcopilot.com') return false
  } catch {
    return false
  }
  return true
}

/** Map a harness credential record back to the pi-ai credential shape (validated). */
function recordToPi(record: CredentialRecord | undefined): Credential | undefined {
  if (record === undefined) return undefined
  if (record.kind !== 'grant') return undefined
  if (!validatePiCredential(record.payload)) {
    console.warn('dsh-oauth-copilot: ignoring invalid/forged Copilot grant record')
    return undefined
  }
  const payload = record.payload as Credential & { availableModelIds?: readonly string[] }
  // An empty availableModelIds list means "unknown yet" (the login-time model
  // fetch can time out), not "no models": pi-ai's filterModels applies an
  // empty allow-list and would hide every model. Normalize to undefined so the
  // model catalog stays fully available until a refresh repopulates the list.
  if (Array.isArray(payload.availableModelIds) && payload.availableModelIds.length === 0) {
    const { availableModelIds: _omitted, ...rest } = payload
    return rest as Credential
  }
  return payload
}

function piToRecord(credential: Credential | undefined): CredentialRecord | undefined {
  if (credential === undefined) return undefined
  // Never persist a credential that the read path would reject.
  if (!validatePiCredential(credential)) return undefined
  return { kind: 'grant', payload: credential }
}

/**
 * A pi-ai `CredentialStore` over the harness credential records. This is the
 * same mapping dsh-llm-pi-ai's own store performs, restated here so this
 * plugin's adapter collection reads exactly the grant the authorization flow
 * committed — keeping pi-ai's OAuth refresh and model filtering working.
 */
export function credentialStoreFrom(ctx: Context): CredentialStore {
  return {
    async read(): Promise<Credential | undefined> {
      return recordToPi(await ctx.credentials.readRecord(GITHUB_COPILOT_RECORD_KEY))
    },
    async list(): Promise<readonly CredentialInfo[]> {
      const entries = await ctx.credentials.listRecords()
      return entries
        .filter(entry => entry.key === GITHUB_COPILOT_RECORD_KEY)
        .map(entry => ({
          providerId: 'github-copilot',
          type: entry.kind === 'grant' ? 'oauth' as const : 'api_key' as const,
        }))
    },
    async modify(
      providerId: string,
      fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    ): Promise<Credential | undefined> {
      const updated = await ctx.credentials.modifyRecord(GITHUB_COPILOT_RECORD_KEY, async current => {
        const next = await fn(recordToPi(current))
        return piToRecord(next)
      })
      return recordToPi(updated)
    },
    async delete(): Promise<void> {
      await ctx.credentials.deleteRecord(GITHUB_COPILOT_RECORD_KEY)
    },
  }
}

/**
 * Ambient lookups for provider auth resolution: credentials seam first, then
 * the launch environment; file existence against the host process filesystem.
 */
export function authContextFrom(ctx: Context): AuthContext {
  return {
    async env(name: string): Promise<string | undefined> {
      if (isCredentialRefName(name)) {
        try {
          const hit = await ctx.credentials.resolve(credentialRef(name))
          if (hit !== undefined && hit.value.length > 0) return hit.value
        } catch {
          // credentials seam unavailable in this composition — fall through
        }
      }
      return process.env[name]
    },
    async fileExists(path: string): Promise<boolean> {
      const { existsSync } = await import('node:fs')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')
      const expanded = path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
      return existsSync(expanded)
    },
  }
}
