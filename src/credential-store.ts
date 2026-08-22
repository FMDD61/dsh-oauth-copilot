import type { AuthContext, Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, isCredentialRefName, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { GITHUB_COPILOT_RECORD_KEY } from './constants.js'

/** Map a harness credential record back to the pi-ai credential shape. */
function recordToPi(record: CredentialRecord | undefined): Credential | undefined {
  if (record === undefined) return undefined
  if (record.kind !== 'grant') return undefined
  return record.payload as Credential
}

function piToRecord(credential: Credential | undefined): CredentialRecord | undefined {
  if (credential === undefined) return undefined
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
