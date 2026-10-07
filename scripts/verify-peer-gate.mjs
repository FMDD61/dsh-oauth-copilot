#!/usr/bin/env node
/**
 * Recompute the dsh plugin compatibility gate for this package.
 *
 * Mirrors `evaluatePluginCompatibility` in
 * `@deepseek-ai/dsh-app-boot/lib/index.js`: only peers whose name is
 * `@deepseek-ai/dsh` or starts with `@deepseek-ai/dsh-` are checked, and
 * prereleases participate in the range (`includePrerelease: true`). A peer
 * outside its range makes the host skip the whole bundle, which removes the
 * github-copilot model entry from dsh entirely.
 *
 * Usage:
 *   node scripts/verify-peer-gate.mjs                # the two known host lines
 *   node scripts/verify-peer-gate.mjs 0.2.0-rc.2 ...  # explicit host versions
 *
 * Exits 1 when any host version would be blocked.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** semver comes from the checkout, or from the installed dsh host. */
function loadSemver() {
  const candidates = [
    'semver',
    '/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/semver',
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {
      // try the next source
    }
  }
  throw new Error('semver not found: install it (npm i -D semver) or run where dsh is installed')
}

const semver = loadSemver()
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** The gate's own name filter. */
function isGated(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

/** The gate's own check, per peer. */
function blockedPeers(manifest, runtimeVersion) {
  const blocked = {}
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!isGated(name)) continue
    if (!semver.satisfies(runtimeVersion, range, { includePrerelease: true })) blocked[name] = range
  }
  return blocked
}

const gated = Object.keys(manifest.peerDependencies ?? {}).filter(isGated)
const hosts = process.argv.slice(2)
if (hosts.length === 0) hosts.push('0.1.7-rc.2', '0.2.0-rc.2', '0.2.1-alpha')

console.log(`${manifest.name}@${manifest.version} — ${gated.length} gated peers`)
let failed = 0
for (const host of hosts) {
  if (semver.valid(host) === null) {
    console.log(`  dsh ${host.padEnd(14)} SKIP  (not a semantic version)`)
    continue
  }
  const blocked = blockedPeers(manifest, host)
  const names = Object.keys(blocked)
  if (names.length === 0) {
    console.log(`  dsh ${host.padEnd(14)} PASS  all ${gated.length} gated peers satisfied`)
  } else {
    failed += 1
    console.log(`  dsh ${host.padEnd(14)} BLOCKED  ${names.map(n => `${n}@${blocked[n]}`).join(', ')}`)
  }
}

/**
 * Host lines the package must **refuse**. An upper bound written as `<0.3.0` looks right and
 * is not: the gate evaluates ranges with `includePrerelease: true`, so `0.3.0-rc.1` is *less
 * than* `0.3.0` and slips through. `<0.3.0-0` is the bound that actually excludes the whole
 * 0.3.0 prerelease line. This check exists so that bound cannot silently regress.
 */
const REFUSED = ['0.3.0-0', '0.3.0-rc.1', '0.3.0']

let wronglyAccepted = 0
for (const host of REFUSED) {
  const blocked = Object.keys(blockedPeers(manifest, host))
  if (blocked.length === gated.length) {
    console.log(`  dsh ${host.padEnd(14)} REFUSED  all ${gated.length} gated peers out of range`)
  } else {
    wronglyAccepted += 1
    console.log(`  dsh ${host.padEnd(14)} ACCEPTED  <-- must be refused (${gated.length - blocked.length} peer(s) still satisfied)`)
  }
}
console.log('')
process.exit(failed === 0 && wronglyAccepted === 0 ? 0 : 1)
