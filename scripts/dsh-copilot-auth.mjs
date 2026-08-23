#!/usr/bin/env node
/**
 * dsh-copilot-auth — MANUAL GitHub Copilot OAuth for DeepSeek Harness.
 *
 * The primary sign-in path: run by the human in a terminal, no LLM involved.
 *   node scripts/dsh-copilot-auth.mjs login [--enterprise-url <domain>]
 *   node scripts/dsh-copilot-auth.mjs status
 *   node scripts/dsh-copilot-auth.mjs logout
 *
 * Writes the grant into $DSH_HOME/.credentials.yaml under
 * records: llm-pi-ai/github-copilot (the same record the dsh-oauth-copilot
 * adapter reads), with 0600 perms and an atomic rename. Tokens are never
 * printed; provider errors are redacted before display.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'
import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot'

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const CRED_FILE = join(DSH_HOME, '.credentials.yaml')
const RECORD_KEY = 'llm-pi-ai/github-copilot'

function safeMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/((?:access|refresh|id)_token["'=:\s]+)[^&\s,"'}]+/giu, '$1[redacted]')
    .replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 1000)
}

/** Same grant validation as src/credential-store.ts (never trust a forged record). */
function validateGrant(payload) {
  if (typeof payload !== 'object' || payload === null) return false
  if (payload.type !== 'oauth') return false
  if (typeof payload.access !== 'string' || payload.access.length === 0) return false
  if (typeof payload.refresh !== 'string' || payload.refresh.length === 0) return false
  if (typeof payload.expires !== 'number') return false
  const proxy = /(?:^|;)proxy-ep=([^;]+)/.exec(payload.access)
  if (proxy === null) return false
  try {
    const host = new URL(`https://${proxy[1]}`).hostname
    const enterprise = typeof payload.enterpriseUrl === 'string' && payload.enterpriseUrl.length > 0
      ? payload.enterpriseUrl
      : undefined
    const ehost = enterprise === undefined ? undefined : new URL(`https://${enterprise}`).hostname
    const allowed = new Set(['proxy.individual.githubcopilot.com'])
    if (ehost !== undefined) allowed.add(`proxy.${ehost}`)
    return allowed.has(host)
  } catch {
    return false
  }
}

function readDoc() {
  if (!exists() ) return { version: 1, refs: {}, records: {} }
  const raw = readFileSync(CRED_FILE, 'utf8')
  const doc = yaml.load(raw)
  if (typeof doc !== 'object' || doc === null) throw new Error(`无法解析 ${CRED_FILE}`)
  if (doc.version === undefined) doc.version = 1
  if (doc.refs === undefined) doc.refs = {}
  if (doc.records === undefined) doc.records = {}
  return doc
}
function exists() { try { readFileSync(CRED_FILE); return true } catch { return false } }

function writeDoc(doc) {
  mkdirSync(dirname(CRED_FILE), { recursive: true, mode: 0o700 })
  const tmp = `${CRED_FILE}.tmp-${process.pid}`
  writeFileSync(tmp, yaml.dump(doc, { lineWidth: 200 }), { mode: 0o600 })
  renameSync(tmp, CRED_FILE)
}

function getRecord(doc) { return doc.records[RECORD_KEY] }

async function cmdLogin(args) {
  const enterpriseUrl = args['--enterprise-url'] ?? ''
  const timeoutMs = Number(args['--timeout'] ?? 180000)
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout 必须是正整数毫秒')

  const doc = readDoc()
  if (getRecord(doc) !== undefined) {
    console.error('GitHub Copilot 已有登录记录。如需重新登录请先执行 logout。')
    process.exit(1)
  }
  if (enterpriseUrl.length > 0) {
    let host
    try { host = new URL(enterpriseUrl.includes('://') ? enterpriseUrl : `https://${enterpriseUrl}`).hostname }
    catch { throw new Error(`无效的企业域名: ${safeMessage(enterpriseUrl)}`) }
    console.error(`⚠ 目标端点: https://${host}（GitHub Enterprise）。确认后继续；非官方域名有凭据窃取风险。`)
  }

  const oauth = githubCopilotProvider().auth.oauth
  if (oauth === undefined) throw new Error('当前 pi-ai 未提供 GitHub Copilot OAuth')

  const signal = AbortSignal.timeout(timeoutMs)
  process.on('SIGINT', () => signal.dispatchEvent(new Event('abort')))
  const credential = await oauth.login({
    signal,
    prompt: async (p) => {
      if (p.type === 'select') return p.options[0]?.id ?? ''
      if (p.type === 'text' && enterpriseUrl.length > 0) return enterpriseUrl
      return ''
    },
    notify: (event) => {
      if (event.type === 'device_code') {
        console.error('')
        console.error('==================================================')
        console.error('  请打开: ' + event.verificationUri)
        console.error('  并输入代码: ' + event.userCode)
        if (event.expiresInSeconds !== undefined) console.error(`  （${Math.round(event.expiresInSeconds / 60)} 分钟内有效）`)
        console.error('==================================================')
        console.error('')
      } else if (event.type === 'progress') {
        console.error('  状态: ' + event.message)
      }
    },
  })

  if (!validateGrant(credential)) {
    throw new Error('登录成功但凭据未通过本地校验——已丢弃，请勿使用（可能是异常端点）')
  }
  doc.records[RECORD_KEY] = { kind: 'grant', payload: credential }
  writeDoc(doc)
  const models = Array.isArray(credential.availableModelIds) ? credential.availableModelIds : []
  console.log(`✅ 登录成功，凭据已写入 ${CRED_FILE}`)
  console.log(`   可用模型 ${models.length} 个。`)
  console.log('   打开 dsh Web UI，模型选择器中选择 GitHub Copilot 下的模型即可。')
}

async function cmdStatus() {
  const doc = readDoc()
  const record = getRecord(doc)
  if (record === undefined || record.kind !== 'grant') {
    console.log('GitHub Copilot 未登录。执行: node scripts/dsh-copilot-auth.mjs login')
    return
  }
  if (!validateGrant(record.payload)) {
    console.log('本地凭据记录未通过校验（可能被篡改）——请执行 logout 后重新 login。')
    return
  }
  const p = record.payload
  const models = Array.isArray(p.availableModelIds) ? p.availableModelIds : []
  console.log('GitHub Copilot 已登录（OAuth grant）。')
  console.log(`  Token 过期: ${new Date(p.expires).toLocaleString()}`)
  console.log(`  可用模型: ${models.length > 0 ? models.join(', ') : '（等待模型清单）'}`)
}

async function cmdLogout() {
  const doc = readDoc()
  if (getRecord(doc) === undefined) {
    console.log('没有 GitHub Copilot 登录记录。')
    return
  }
  delete doc.records[RECORD_KEY]
  writeDoc(doc)
  console.log('GitHub Copilot 已在本机登出（本地授权已移除）。如需彻底撤销，请访问 GitHub Settings → Applications。')
}

const [cmd, ...rest] = process.argv.slice(2)
const args = {}
for (let i = 0; i < rest.length; i += 2) args[rest[i]] = rest[i + 1]

try {
  if (cmd === 'login') await cmdLogin(args)
  else if (cmd === 'status') await cmdStatus()
  else if (cmd === 'logout') await cmdLogout()
  else {
    console.error('用法: dsh-copilot-auth.mjs <login|status|logout> [--enterprise-url <域>] [--timeout <ms>]')
    process.exit(2)
  }
} catch (error) {
  console.error('错误: ' + safeMessage(error))
  process.exit(1)
}
