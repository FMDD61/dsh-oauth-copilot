# Changelog

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
