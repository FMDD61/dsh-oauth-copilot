import type { Context } from '@deepseek-ai/cordis'
import type { AuthorizationInteraction, AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GITHUB_COPILOT_PROVIDER_ID, GITHUB_COPILOT_RECORD_KEY } from './constants.js'

export interface LoginToolOptions {
  /** How long a login tool call waits for the human to finish the device code before cancelling. */
  readonly loginWindowMs: number
}

const LOGIN_METHOD = 'oauth'

/** Tool names registered by this module in the current process (dedupe across loader double-apply). */
const registeredTools = new Set<string>()

/**
 * Strip token-like material from provider errors before they reach the model
 * context (V2 of the security review). Same redaction rules as the community
 * dsh-oauth-openai driver.
 */
function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/((?:access|refresh|id)_token["'=:\s]+)[^&\s,"'}]+/giu, '$1[redacted]')
    .replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 1_000)
}

function renderNotice(notice: AuthorizationNotice): string {
  let text = notice.message
  if (notice.url !== undefined) text += `\n  打开: ${notice.url}`
  if (notice.code !== undefined) text += `\n  代码: ${notice.code}`
  return text
}

function answer(prompt: AuthorizationPrompt, enterpriseUrl: string): string {
  if (prompt.kind === 'select') return prompt.options[0]?.id ?? ''
  if (enterpriseUrl.length > 0) return enterpriseUrl
  // GitHub Copilot asks for an optional GitHub Enterprise domain; empty means github.com.
  return ''
}

export function registerLoginTools(ctx: Context, options: LoginToolOptions): (() => void) | undefined {
  // The dsh 0.1.1-rc.2 loader can apply this package twice in one tree (bundle
  // entry + bundle-patch insert entry). Tool registration must be idempotent:
  // the second apply skips tools the first already registered.
  const names = ['github_copilot_login', 'github_copilot_status', 'github_copilot_logout'] as const
  if (names.every(name => registeredTools.has(name))) return undefined
  const disposers: (() => void)[] = []

  const login = defineTool({
    name: 'github_copilot_login',
    description: [
      'Start the GitHub Copilot OAuth sign-in (device code) and register the github-copilot model route.',
      'Run this when the user wants to use their GitHub Copilot subscription in dsh.',
      'The tool prints a verification URL and code; the user must open it and authorize.',
      'Optionally pass enterpriseUrl for GitHub Enterprise (blank = github.com).',
    ].join(' '),
    parameters: {
      enterpriseUrl: { type: 'string', description: 'GitHub Enterprise domain or URL. Omit for github.com.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
    },
    async execute(args, _exec) {
      // V1 of the security review: never let the model point the device flow
      // at an arbitrary enterprise host (device-code phishing / OAT theft).
      // GitHub Enterprise sign-in is only available through the manual CLI
      // (scripts/dsh-copilot-auth.mjs --enterprise-url <domain>).
      const enterpriseUrl = typeof args.enterpriseUrl === 'string' ? args.enterpriseUrl.trim() : ''
      if (enterpriseUrl.length > 0) {
        return 'GitHub Enterprise 登录请使用人工 CLI：在终端执行 scripts/dsh-copilot-auth.mjs login --enterprise-url <域名>。模型工具仅支持 github.com。'
      }
      const current = await ctx.credentials.describeRecord(GITHUB_COPILOT_RECORD_KEY)
      if (current?.configured === true) {
        return 'GitHub Copilot 已登录。如需重新登录，请先注销（github_copilot_logout）。'
      }
      const inFlight = (await ctx.authorization.list())
        .some(entry => entry.key === GITHUB_COPILOT_RECORD_KEY && entry.inFlight)
      if (inFlight) {
        return '已有一个 GitHub Copilot 登录正在进行，请先在浏览器完成上一步，或稍后重试。'
      }
      const notices: string[] = []
      const interaction: AuthorizationInteraction = {
        notify(notice: AuthorizationNotice): void {
          notices.push(renderNotice(notice))
        },
        async prompt(prompt: AuthorizationPrompt): Promise<string> {
          return answer(prompt, '')
        },
      }
      let outcome: { status: 'authorized' | 'cancelled' } | 'timeout'
      try {
        const beginPromise = ctx.authorization.begin({
          key: GITHUB_COPILOT_RECORD_KEY,
          method: LOGIN_METHOD,
          interaction,
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeoutPromise = new Promise<'timeout'>(resolve => {
          timer = setTimeout(() => resolve('timeout'), options.loginWindowMs)
        })
        outcome = await Promise.race([beginPromise, timeoutPromise])
        if (timer !== undefined) clearTimeout(timer)
        if (outcome === 'timeout') {
          // V5: give an authorization that completed exactly at the window edge
          // a moment to settle before cancelling.
          const settled = await Promise.race([
            beginPromise.then(() => true).catch(() => true),
            new Promise<false>(resolve => setTimeout(() => resolve(false), 500)),
          ])
          if (!settled) await ctx.authorization.cancel(GITHUB_COPILOT_RECORD_KEY)
        }
      } catch (error: unknown) {
        // V2: never surface raw provider errors (may embed tokens or
        // attacker-controlled bodies) into the model context.
        const message = safeMessage(error)
        const head = notices.length > 0 ? notices[0] : '已发起 GitHub Copilot 登录。'
        const rest = notices.slice(1).map((n, i) => (i === 0 ? `- ${n}` : n))
        return [head, ...rest, '', `GitHub Copilot 登录失败：${message}`].join('\n')
      }
      if (outcome === 'timeout') {
        const head = notices.length > 0 ? notices[0] : '已发起 GitHub Copilot 登录。'
        const rest = notices.slice(1).map((n, i) => (i === 0 ? `- ${n}` : n))
        return [
          head,
          ...rest,
          '',
          `已等待 ${Math.round(options.loginWindowMs / 1000)} 秒未完成授权，已取消。可再次调用 github_copilot_login 重试。`,
        ].join('\n')
      }
      const lines: string[] = notices.length > 0 ? [...notices] : ['已发起 GitHub Copilot 登录。']
      lines.push('')
      lines.push(outcome.status === 'authorized'
        ? '✅ 登录成功，github-copilot 模型路由已可用（模型选择器中选择 GitHub Copilot 下的模型）。'
        : '登录已取消。')
      return lines.join('\n')
    },
  })
  disposers.push(ctx.tools.register(login))

  const status = defineTool({
    name: 'github_copilot_status',
    description: 'Report whether GitHub Copilot is signed in, when the grant expires, and which models are available.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
    },
    async execute() {
      const record = await ctx.credentials.readRecord(GITHUB_COPILOT_RECORD_KEY)
      if (record === undefined || record.kind !== 'grant') {
        return `GitHub Copilot 未登录（provider: ${GITHUB_COPILOT_PROVIDER_ID}）。使用 github_copilot_login 登录。`
      }
      const payload = record.payload as Record<string, unknown>
      const expires = typeof payload.expires === 'number' ? payload.expires : undefined
      const models = Array.isArray(payload.availableModelIds)
        ? (payload.availableModelIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : []
      const expiryText = expires === undefined || expires <= 0
        ? '未知'
        : new Date(expires).toLocaleString()
      return [
        'GitHub Copilot 已登录（OAuth grant）。',
        `  Token 过期时间: ${expiryText}`,
        `  已确认可用模型: ${models.length > 0 ? models.join(', ') : '（等待模型清单）'}`,
        '登录失效时请求会自动刷新；若刷新失败，请用 github_copilot_logout 后重新登录。',
      ].join('\n')
    },
  })
  disposers.push(ctx.tools.register(status))

  const logout = defineTool({
    name: 'github_copilot_logout',
    description: 'Remove the stored GitHub Copilot OAuth grant locally (no remote revocation; revoke access on GitHub if needed).',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
    },
    async execute() {
      await ctx.credentials.deleteRecord(GITHUB_COPILOT_RECORD_KEY)
      return 'GitHub Copilot 已在本机登出（本地授权已移除）。如需彻底撤销，请访问 GitHub Settings → Applications。'
    },
  })
  disposers.push(ctx.tools.register(logout))

  for (const name of names) registeredTools.add(name)

  return () => {
    for (const name of names) registeredTools.delete(name)
    for (const dispose of disposers.splice(0)) dispose()
  }
}
