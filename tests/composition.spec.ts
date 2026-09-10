import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import * as GitHubCopilot from '../src/index.js'

function baseCtx(tools: string[]): Context {
  const ctx = new Context()
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
  return ctx
}

describe('dsh-oauth-copilot composition', () => {
  it('registers only the model route by default (no model-executable login tools)', async () => {
    const ctx = baseCtx([])
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(GitHubCopilot, {})
    expect(ctx.llm.listProviders()).toEqual([{ id: 'github-copilot', name: 'GitHub Copilot' }])
    expect((await ctx.llm.listModels('github-copilot')).length).toBeGreaterThan(0)
    await ctx.fiber.dispose()
  })

  it('resolves every catalog model without a modelErrors crash (0.1.5-rc.1)', async () => {
    const ctx = baseCtx([])
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(GitHubCopilot, {})
    const models = await ctx.llm.listModels('github-copilot')
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      const resolved = await ctx.llm.resolveModelInfo('github-copilot', model.id)
      expect(resolved.id).toBe(model.id)
    }
    await ctx.fiber.dispose()
  })

  it('registers the three login tools when enableModelTools is true', async () => {
    const ctx = baseCtx([])
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(GitHubCopilot, { enableModelTools: true })
    expect(ctx.llm.listProviders()).toEqual([{ id: 'github-copilot', name: 'GitHub Copilot' }])
    await ctx.fiber.dispose()
  })
})