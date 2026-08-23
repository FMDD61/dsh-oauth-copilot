# Security Policy

## Reporting a vulnerability

Please report security issues privately — do **not** open a public issue.
Email the maintainer address listed on the npm package page (or open a
GitHub security advisory once the repository is public), including:

- affected version(s) and dsh/pi-ai versions in use,
- a minimal reproduction (records/credentials must be redacted placeholders),
- impact assessment if known.

You will receive an acknowledgment within 72 hours; fixes are released as
patch versions and disclosed after users had a chance to update.

## Scope

- `src/` plugin code, `scripts/dsh-copilot-auth.mjs` (credential handling),
  and the grant validation rules shared with the CLI.
- Out of scope: upstream dsh / pi-ai / GitHub endpoints.

## Design notes for reviewers

- Grants are validated strictly (official `proxy-ep` only, `enterpriseUrl`
  must be absent) so forged records cannot redirect traffic or exfiltrate the
  refresh token; tests under `tests/credential-store.spec.ts` lock these.
- The CLI is the human-only sign-in path; model tools are off by default.
