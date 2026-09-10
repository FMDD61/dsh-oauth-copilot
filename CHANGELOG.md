# Changelog

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
