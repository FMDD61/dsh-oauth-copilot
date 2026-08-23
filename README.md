# dsh-oauth-copilot

GitHub Copilot sign-in and model route for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh).

Sign in to GitHub via the device-code flow, store the Copilot grant through the harness credential
records, and register a **github-copilot** LLM route backed by pi-ai's Copilot model catalog — all on
official dsh seams, with no third-party OAuth base required.

> **Status: 0.1.0 (dev)** — built and smoke-tested against dsh 0.1.1-rc.2 / pi-ai 0.82.1.
> A real GitHub account login pass is still required before wider use.

## Why not the community dsh-oauth base

The current dsh-oauth release (0.2.0) is built against the 0.1.0-rc.6/rc.8 package line and its peers
are semver-incompatible with the shipped dsh 0.1.1-rc.2 — npm refuses to install both in one profile.
This plugin therefore targets the official seams directly (`ctx.credentials` records, `ctx.authorization`
flows, `ctx.llm` adapters), which also keeps the login working when dsh-llm-pi-ai's registered Copilot
flow is present.

## Install

```sh
cd ~/projects/dsh-oauth-copilot
npm run build
dsh plugin --profile web add dsh-oauth-copilot   # npm 发布后；本地开发: add <仓库路径>
```

Restart `dsh web` once. The plugin's `cordis.patch.yml` (id `llm-github-copilot`) is loaded from the
package's `dsh.bundle.patch`. The `authorization` service entry in the profile patch activates the
model login tools when they are enabled.

## Use — manual CLI is the primary path

Sign-in is a **human-only terminal operation**; no LLM involvement, so prompt-injection in a
non-official model cannot start or drop an authorization.

```sh
cd ~/projects/dsh-oauth-copilot
dsh-copilot-auth login                 # prints device-code URL + code
dsh-copilot-auth status                # grant expiry + available models
dsh-copilot-auth logout                # remove the local grant
```

`login` accepts `--enterprise-url <domain>` for GitHub Enterprise (the target host is shown for
confirmation before the flow starts) and `--timeout <ms>` (default 180000). Tokens are never
printed; provider errors are redacted; the credential file is written atomically with 0600 perms.

After login, pick any model under **GitHub Copilot** in the model picker. Requests authenticate with
the Copilot token; expired tokens refresh automatically; the model list is filtered by the account's
available models (pi-ai's native `filterModels`).

## Opt-in model tools

Model-executable tools (`github_copilot_login` / `github_copilot_status` / `github_copilot_logout`)
are **off by default** and only register when the `authorization` service is mounted **and**
`enableModelTools: true` is set. The login tool only supports github.com — enterprise domains are
CLI-only — and all tool errors are redacted before they reach the model context.

```yaml
- id: llm-github-copilot
  config:
    enableModelTools: true       # opt in; default false
    loginWindowMs: 180000        # how long a login tool call waits before cancelling
    streamIdleTimeoutMs: 300000
```

## Security posture

Reviewed against the community implementations (dsh-oauth / dsh-oauth-openai) with an adversarial
review pass; fixes applied:

- **Grant validation** (`src/credential-store.ts`, CLI): stored payloads are schema-checked and the
  `proxy-ep` endpoint must be the official host or the record's own enterprise host — forged records
  can no longer redirect model traffic to an attacker server.
- **Enterprise host injection** (V1): the model login tool refuses `enterpriseUrl`; the CLI shows and
  requires the target host before starting a flow.
- **Redaction** (V2): provider errors are JWT/token-pattern redacted and truncated before display.
- **Model-side authority** (V4): sign-in/out tools default off; the CLI path needs no model at all.
- No redirect URI, no local callback port, scope fixed at `read:user`, one authorization attempt per
  key, credentials stored 0600 outside settings/describe/environment.

## How it works

| Piece | File | Responsibility |
|---|---|---|
| Route | `src/adapter.ts` | Registers `github-copilot` via `PiAiAdapter`; request-level apiKey stays undefined so pi-ai's native OAuth auth takes over |
| Grant bridge | `src/credential-store.ts` | Strictly validated mapping of the harness record `llm-pi-ai/github-copilot` (kind `grant`) to a pi-ai `CredentialStore` + ambient `AuthContext` |
| Manual CLI | `scripts/dsh-copilot-auth.mjs` | Human-driven device-code login/status/logout writing the same record |
| Login tools | `src/login-tool.ts` | Optional model tools driving the `ctx.authorization` flow (opt-in only) |

## Development

```sh
npm install
npm run typecheck
npm test          # unit + composition + grant validation
npm run build
node scripts/smoke.mjs           # mounts the built plugin on real seams in a temp DSH_HOME
node scripts/smoke-noauth.mjs    # verifies the tree still boots without the authorization service
```

## Compatibility note

The model route always activates; login tools need the `authorization` service mounted and the
opt-in flag. dsh 0.1.1-rc.2's dsh-base does not mount that service by default — the profile patch
adds it. A missing service must never take the whole plugin tree down.

## License

MIT