# dsh-oauth-copilot

[![npm](https://img.shields.io/npm/v/dsh-oauth-copilot)](https://www.npmjs.com/package/dsh-oauth-copilot) · [GitHub](https://github.com/FMDD61/dsh-oauth-copilot)

GitHub Copilot sign-in and model route for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh).

Sign in to GitHub via the device-code flow, store the Copilot grant through the harness credential
records, and register a **github-copilot** LLM route backed by pi-ai's Copilot model catalog — all on
official dsh seams, with no third-party OAuth base required.

> **Status: 0.2.0** — built and verified against dsh 0.1.5-rc.1 / pi-ai 0.85.1 (typecheck/build/14
> tests green, including a compose-level catalog-resolution regression for the rc.1 `modelErrors`
> contract). 中文版见 [README.zh-CN.md](README.zh-CN.md).

## Why not the community dsh-oauth base

The current dsh-oauth release (0.2.0) is built against the 0.1.0-rc.6/rc.8 package line and its peers
are semver-incompatible with the shipped dsh 0.1.x line — npm refuses to install both in one profile.
This plugin therefore targets the official seams directly (`ctx.credentials` records, `ctx.authorization`
flows, `ctx.llm` adapters), which also keeps the login working when dsh-llm-pi-ai's registered Copilot
flow is present.

## Install

Published form (no clone or build needed):

```sh
dsh plugin --profile web add dsh-oauth-copilot
```

Restart `dsh web`. The package's `cordis.patch.yml` (`llm-github-copilot`) is loaded from
`dsh.bundle.patch`; the `authorization` service entry in the profile patch activates the login
machinery (see Compatibility note).

Development form (from a checkout of this repo):

```sh
npm install && npm run build
dsh plugin --profile web add /path/to/dsh-oauth-copilot
```

## Use — manual CLI is the primary path

Sign-in is a **human-only terminal operation**; no LLM involvement, so prompt injection in a
non-official model cannot start or drop an authorization.

```sh
# The CLI ships with the npm package. Either install it globally...
npm install -g dsh-oauth-copilot
dsh-copilot-auth login          # prints device-code URL + code; authorize in the browser
# ...or run it through npx without installing anything:
npx -y dsh-oauth-copilot login

dsh-copilot-auth status         # grant expiry + available models
dsh-copilot-auth refresh        # re-fetch the account-enabled model list into the grant
dsh-copilot-auth logout         # remove the local grant
```

Only github.com is supported (GitHub Enterprise is not; see Known limitations). Tokens are never
printed; provider errors are redacted; the credential file is written atomically with 0600 perms.

## Model picker notes

The picker lists the advisory pi-ai catalog (29 Copilot models). Not every model is enabled for your
account: an unavailable pick returns HTTP 400 "model not supported". `dsh-copilot-auth refresh`
stores the account-enabled list (`policy=enabled`) into the grant, so the picker then shows only
those; a failed/empty refresh leaves the full advisory list visible — retry `refresh` or pick a model
from the `status` output.

## Opt-in model tools

Model-executable tools (`github_copilot_login` / `github_copilot_status` / `github_copilot_logout`)
are **off by default** and only register when the `authorization` service is mounted **and**
`enableModelTools: true` is set. Tool errors are redacted before they reach the model context.

```yaml
- id: llm-github-copilot
  config:
    enableModelTools: true       # opt in; default false
    loginWindowMs: 180000        # how long a login tool call waits before cancelling
    streamIdleTimeoutMs: 300000
```

## Known limitations

- **GitHub Enterprise is not supported.** The grant whitelist accepts only the official endpoint
  (`proxy.individual.githubcopilot.com`), and the model login tool and the CLI reject enterprise
  domains explicitly. This is a security decision: a forged `enterpriseUrl` would redirect pi-ai's
  automatic token refresh to an attacker server.
- **Tied to the 0.1.5-rc.1 package line.** Peer ranges are `^0.1.5-rc.1` and the pi-ai dependency is
  `^0.85.1`; a future dsh 0.2.0 upgrade will extend them along with the adapter contract. The
  `modelErrors` member is additive, so hosts that do not read it ignore it.
- The CLI prints zh-CN messages (bilingual PRs welcome).
- Do not run `dsh-copilot-auth login/logout` while another process is actively writing the
  credentials file; the CLI uses atomic 0600 writes but does not take dsh's cross-process write lock.

## FAQ

- **`dsh-copilot-auth: command not found`** — install the package with npm
  (`npm install -g dsh-oauth-copilot`) or invoke `npx -y dsh-oauth-copilot login`.
- **Model request returns HTTP 400 "model not supported"** — run `dsh-copilot-auth refresh`, then
  pick a model from the `status` output.
- **How do I revoke access completely?** `dsh-copilot-auth logout` removes the local grant; on
  GitHub, Settings → Applications → revoke the Copilot authorization.
- **Where is the login button in the web UI?** There isn't one (dsh 0.1.5-rc.1 exposes no OAuth
  surface in the Models page); the CLI is the sign-in path.
- **How do I update the plugin?** `npm install -g dsh-oauth-copilot@latest && dsh plugin --profile
  web add dsh-oauth-copilot` (or bump the version in the profile package.json), then restart dsh web.

## Security posture

Reviewed against the community implementations (dsh-oauth / dsh-oauth-openai) with adversarial
review passes; decisions in place:

- **Grant validation** (`src/credential-store.ts`, CLI): stored payloads are schema-checked; the
  `proxy-ep` endpoint must be the official host ONLY, and any non-empty `enterpriseUrl` rejects the
  record — closing both the traffic-redirection and the refresh-token exfiltration paths.
- **Device flow** stays on github.com; no redirect URI, no local callback port, scope fixed at
  `read:user`, one authorization attempt per key.
- **Redaction**: provider errors are JWT/token-pattern redacted and truncated before display.
- **Model-side authority**: sign-in/out tools default off; the CLI path needs no model at all.
- Credentials are stored 0600, outside settings/describe/environment, never echoed by the CLI.

## How it works

| Piece | File | Responsibility |
|---|---|---|
| Route | `src/adapter.ts` | Registers `github-copilot` via `PiAiAdapter`; request-level apiKey stays undefined so pi-ai's native OAuth auth takes over |
| Grant bridge | `src/credential-store.ts` | Strictly validated mapping of the harness record `llm-pi-ai/github-copilot` (kind `grant`) to a pi-ai `CredentialStore` + ambient `AuthContext` |
| Manual CLI | `scripts/dsh-copilot-auth.mjs` | Human-driven device-code login/status/refresh/logout writing the same record |
| Login tools | `src/login-tool.ts` | Optional model tools driving the `ctx.authorization` flow (opt-in only) |

## Development

```sh
npm install
npm run typecheck
npm test          # unit + composition + grant validation
npm run build
# scripts/ ship with the repo, not the npm tarball: run them from a checkout
node scripts/smoke.mjs           # mounts the built plugin on real seams in a temp DSH_HOME
node scripts/smoke-noauth.mjs    # verifies the tree still boots without the authorization service
node scripts/verify-live.mjs     # real-grant end-to-end probe (uses the real grant; sends one tiny request)
node scripts/verify-vision.mjs   # opencode-go vision route probe (REASONING_EFFORT=low|high|max|off)
```

## Compatibility note

The model route always activates; login tools need the `authorization` service mounted and the
opt-in flag. The shipped dsh-base profile does not mount that service by default — the profile
patch adds it. A missing service must never take the whole plugin tree down.

## License

MIT