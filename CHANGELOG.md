# Changelog

## 0.3.1 — 2026-10-07

Version-adapter tightening plus public-facing docs. **No source change** — every seam this plugin
uses is unchanged.

- **The upper bound of every peer range was wrong.** The ranges ended in `<0.3.0`, which reads as
  "0.2.x only" but is not: the host evaluates peers with `includePrerelease: true`, and
  `0.3.0-rc.1` is *less than* `0.3.0`. The entire 0.3.0 prerelease line was therefore admitted — a
  dsh this package has never been tested against. All six gated peers now end in `<0.3.0-0`, the
  bound that actually excludes it.
- **`verify:gate` now checks both directions.** It also asserts that `0.3.0-0`, `0.3.0-rc.1` and
  `0.3.0` are *refused*, so the bound cannot regress unnoticed; the default host list gained
  `0.2.1-alpha`.
- **Docs.** Bilingual READMEs brought in line — English is the default, Chinese lives at
  `README_zh.md`. The compatibility note now explains the gate's `includePrerelease` semantics and
  why the upper bound is written `<0.3.0-0`. New `AGENTS.md` for an agent asked to install, sign in
  or diagnose the plugin.

## 0.3.0 — 2026-09-30

dsh 0.2.0-rc.2 compatibility. Peer ranges widened and the pi-ai dependency range
extended; **no source change was needed**.

- **Why the peer ranges changed.** The host's plugin compatibility gate
  (`@deepseek-ai/dsh-app-boot/lib/index.js`, `evaluatePluginCompatibility`) checks
  every peer named `@deepseek-ai/dsh` or prefixed `@deepseek-ai/dsh-` with
  `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`. The old
  `^0.1.5-rc.1` has an upper bound of `<0.2.0`, so on dsh 0.2.0-rc.2 all six
  gated peers were incompatible and the host skipped the **whole bundle** — the
  github-copilot entry vanished from the model picker. The six peers are now
  `>=0.1.5-rc.1 <0.3.0`, which admits both the 0.1.x and the 0.2.x host lines.
  Recompute with `npm run verify:gate`.
- **Why 0.2.0-rc.2 needed no code change.** Every seam this plugin calls is
  unchanged between dsh 0.1.7-rc.2 and 0.2.0-rc.2. All `.d.ts` files of
  `dsh-attachment`, `dsh-authorization`, `dsh-credentials`, `dsh-llm` and
  `dsh-tools` are byte-identical, and `dsh-llm-pi-ai` differs only in internal
  compat-gate keys (the Mistral fields pi-ai 0.87.1 added), one replay doc
  comment, and the Anthropic replay-model retention rule — none of which this
  plugin touches. The seams actually used are all present and unchanged:
  `resolveRetryPolicy`, `PiAiAdapter` with `prepareCall`/`stream`,
  `ResolvedPiAiProviderProfile` (including the required `modelErrors` map),
  `credentialKey`/`credentialRef`/`isCredentialRefName`,
  `ctx.credentials.{readRecord,listRecords,modifyRecord,deleteRecord,describeRecord,resolve}`,
  `ctx.authorization.{begin,list,cancel}`, `defineTool`, `ctx.llm.registerAdapter`.
- **pi-ai dependency widened from `^0.85.1` to `>=0.85.1 <0.88.0`.**
  dsh-llm-pi-ai 0.2.0-rc.2 depends on pi-ai `^0.87.1` where 0.1.7-rc.2 used
  `^0.85.1`. pi-ai stays a regular dependency (not a peer) because the standalone
  `npx -y dsh-oauth-copilot login` CLI imports
  `@earendil-works/pi-ai/providers/github-copilot` outside any dsh process, with
  no host fallback. `^0.85.1` caps at `<0.86.0`, so it would have kept a second,
  stale pi-ai pinned in the profile: the github-copilot catalog gains
  `claude-opus-5.5`, `gpt-6-luna`, `gpt-6-sol` and `grok-4.7` in 0.87.1 (28 → 32
  advisory models) and moves `gpt-6-astra` to the responses protocol. No
  github-copilot model ID is removed in 0.87.1, and a mismatched pair still
  lists, resolves and streams (verified), so a stale copy degrades the picker
  rather than breaking the route.
- **Dev dependencies raised to the 0.2.0-rc.2 line** (cordis `^4.0.4`) so
  typecheck, build and the test suite exercise the new declarations.
- **`vitest` lowered from `^4.1.0` to `^3.2.0`.** npm 10.9.8 crashes
  (`Cannot read properties of null (reading 'edgesOut')`) resolving vitest 4.x
  against the 0.2.0-rc.2 packages' exact-version peer closure; vitest 3 resolves
  the same tree and runs the suite unchanged. This affects the checkout's dev
  install only — nothing in the published tarball depends on it.
- **New:** `scripts/verify-peer-gate.mjs` (`npm run verify:gate`) recomputes the
  host gate for `0.1.7-rc.2` and `0.2.0-rc.2` with the same
  `includePrerelease: true` matcher, and exits non-zero if any host is blocked.

## 0.2.0 — 2026-09-10

dsh 0.1.5-rc.1 compatibility hotfix.

- **Fixed the rc.1 catalog failure.** `ResolvedPiAiProviderProfile` now carries
  the required empty `modelErrors` map. In rc.1 `PiAiAdapter.modelOf()` reads
  `profile.modelErrors.get(model)` before dispatch, so the old profile shape
  threw `Cannot read properties of undefined (reading 'get')` and the whole
  github-copilot group disappeared from the model picker. The field is
  additive, so pre-rc.1 0.1.x hosts ignore it.
- Peer ranges raised to `^0.1.5-rc.1` (cordis `^4.0.2`); the pi-ai dependency
  is `^0.85.1`; dev dependencies are pinned to the `0.1.5-rc.1` line.
- Regression coverage: a composition test resolves every Copilot catalog model
  through `resolveModelInfo` and fails on rc.1 without the `modelErrors` member
  (14 tests total). Verified with dsh 0.1.5-rc.1 + pi-ai 0.85.1.

## 0.1.1 — 2026-08-30

Compatibility maintenance (no code change).

- Verified against **dsh 0.1.2-alpha.1**: all used seams confirmed present
  (`ctx.llm.registerAdapter`, `PiAiAdapter`, `ctx.authorization.begin/cancel/list`,
  `ctx.credentials.{readRecord,describeRecord,deleteRecord}`, `credentialRef`);
  peer ranges `^0.1.1-rc.2` cover `0.1.2-alpha.1`; typecheck/build/13 tests green.

## 0.1.0 — 2026-08-23

Initial release.

- GitHub Copilot sign-in via device-code flow, human-only CLI (`dsh-copilot-auth`)
  as the primary path; model-executable tools are opt-in (`enableModelTools`).
- `github-copilot` model route through `PiAiAdapter` with OAuth grant stored in
  harness credential records (`llm-pi-ai/github-copilot`, kind `grant`).
- Security hardening from adversarial review: official-endpoint-only grant
  validation (schema + `proxy-ep` whitelist + rejected `enterpriseUrl`, closing
  traffic-redirection and refresh-token exfiltration paths), token redaction,
  no enterprise-host device flows, tools off by default.
- Runtime fixes verified against a real account: string-content normalization
  for pi-ai Copilot headers (`prepareCall`/`stream`), account-enabled model
  list refresh (`dsh-copilot-auth refresh`, `/models policy=enabled`).