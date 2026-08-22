import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import * as GitHubCopilot from '../src/index.js'

describe('dsh-oauth-copilot composition', () => {
  it('registers the github-copilot LLM route and the three login tools', async () => {
    const ctx = new Context()
    const tools: string[] = []
    ctx.provide('systemPrompt', { section() {} })
    ctx.provide('tools', {
      register(tool: { name: string }) {
        tools.push(tool.name)
        return () => { tools.splice(tools.indexOf(tool.name), 1) }
      },
    } as never)
    ctx.provide('credentials', {
      readRecord: async () => undefined,
      describeRecord: async () => ({ configured: false, writable: true }),
      modifyRecord: async (_key: string, _fn: unknown) => undefined,
      deleteRecord: async () => {},
      listRecords: async () => [],
      resolve: async () => undefined,
    } as never)
    ctx.provide('authorization', {
      list: async () => [],
      begin: async () => ({ status: 'authorized' as const }),
      cancel: async () => {},
      describe: async () => undefined,
      registerFlow: () => () => {},
    } as never)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(GitHubCopilot, {})
    expect(tools).toEqual(['github_copilot_login', 'github_copilot_status', 'github_copilot_logout'])
    expect(ctx.llm.listProviders()).toEqual([{ id: 'github-copilot', name: 'GitHub Copilot' }])
    expect((await ctx.llm.listModels('github-copilot')).length).toBeGreaterThan(0)
    await ctx.fiber.dispose()
  })
})
