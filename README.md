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
dsh plugin --profile web add /home/fmdd61/projects/dsh-oauth-copilot
```

Restart `dsh web` once. The plugin's `cordis.patch.yml` (id `llm-github-copilot`) is loaded from the
package's `dsh.bundle.patch`.

## Use

Ask the agent (or type in the web chat):

- **"登录 GitHub Copilot"** → calls `github_copilot_login` — prints the device-code URL + code;
  open it, authorize, and the tool finishes with a success message.
- **"查看 Copilot 状态"** → `github_copilot_status` — grant expiry and available models.
- **"注销 GitHub Copilot"** → `github_copilot_logout` — removes the local grant.

After login, pick any model under **GitHub Copilot** in the model picker. Requests authenticate with
the Copilot token; expired tokens refresh automatically; the model list is filtered by the account's
available models (pi-ai's native `filterModels`).

## Config

```yaml
- id: llm-github-copilot
  config:
    loginWindowMs: 180000       # how long a login tool call waits before cancelling
    streamIdleTimeoutMs: 300000
```

## How it works

| Piece | File | Responsibility |
|---|---|---|
| Route | `src/adapter.ts` | Registers `github-copilot` via `PiAiAdapter`; request-level apiKey stays undefined so pi-ai's native OAuth auth takes over |
| Grant bridge | `src/credential-store.ts` | Maps the harness record `llm-pi-ai/github-copilot` (kind `grant`, pi-ai credential payload) to a pi-ai `CredentialStore` + ambient `AuthContext` |
| Login | `src/login-tool.ts` | Agent tools that drive the already-registered `ctx.authorization` flow for the Copilot key (device code), plus status/logout |

## Development

```sh
npm install
npm run typecheck
npm test          # unit + composition
npm run build
node scripts/smoke.mjs   # mounts the built plugin on real seams in a temp DSH_HOME
```

## Compatibility note

Login tools (`github_copilot_login` / `github_copilot_status` / `github_copilot_logout`) register
only when the `authorization` service is mounted — dsh 0.1.1-rc.2's dsh-base does not mount it, so
in that stock combination the plugin activates with the **github-copilot route only** (no login
tools). The model route itself never depends on the authorization service; a missing service must
not take the whole plugin tree down.

## License

MIT
