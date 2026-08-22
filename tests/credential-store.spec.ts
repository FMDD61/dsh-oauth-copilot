import type { Credential } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { GITHUB_COPILOT_RECORD_KEY } from '../src/constants.js'
import { credentialStoreFrom } from '../src/credential-store.js'

const grant: Credential = {
  type: 'oauth',
  access: 'tid=t-1;exp=1800000;proxy-ep=proxy.individual.githubcopilot.com',
  refresh: 'github-oat-1',
  expires: 2_000_000_000_000,
  accountId: 'proxy.individual.githubcopilot.com',
  availableModelIds: ['gpt-5.5', 'claude-sonnet-4.5'],
}

function memoryCredentials() {
  const records = new Map<string, unknown>()
  return {
    records,
    async readRecord(key: string) { return records.get(key) as never },
    async listRecords() {
      return [...records.entries()].map(([key, value]) => ({
        key,
        kind: (value as { kind?: string }).kind ?? 'grant',
      })) as never
    },
    async modifyRecord(key: string, fn: (current: never) => Promise<unknown>) {
      const next = await fn(records.get(key) as never)
      if (next === undefined) return records.get(key) as never
      records.set(key, next)
      return next as never
    },
    async deleteRecord(key: string) { records.delete(key) },
    async resolve() { return undefined },
    async describeRecord() { return { configured: records.size > 0, writable: true } as never },
  }
}

describe('GitHub Copilot credential store bridge', () => {
  it('reads the grant committed under llm-pi-ai/github-copilot', async () => {
    const credentials = memoryCredentials()
    credentials.records.set(GITHUB_COPILOT_RECORD_KEY, { kind: 'grant', payload: grant })
    const store = credentialStoreFrom({ credentials } as never)
    await expect(store.read()).resolves.toEqual(grant)
  })

  it('writes a modified credential back as a grant record', async () => {
    const credentials = memoryCredentials()
    credentials.records.set(GITHUB_COPILOT_RECORD_KEY, { kind: 'grant', payload: grant })
    const store = credentialStoreFrom({ credentials } as never)
    const updated = await store.modify('github-copilot', async current => ({
      ...current!,
      access: 'tid=t-2;exp=1800000;proxy-ep=proxy.individual.githubcopilot.com',
    }))
    expect(updated?.access).toContain('t-2')
    const stored = credentials.records.get(GITHUB_COPILOT_RECORD_KEY) as { kind: string; payload: Credential }
    expect(stored.kind).toBe('grant')
    expect(stored.payload.access).toContain('t-2')
  })

  it('deletes the record on logout', async () => {
    const credentials = memoryCredentials()
    credentials.records.set(GITHUB_COPILOT_RECORD_KEY, { kind: 'grant', payload: grant })
    const store = credentialStoreFrom({ credentials } as never)
    await store.delete('github-copilot')
    expect(credentials.records.has(GITHUB_COPILOT_RECORD_KEY)).toBe(false)
    await expect(store.read()).resolves.toBeUndefined()
  })
})
