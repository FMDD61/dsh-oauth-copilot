# AGENTS.md — installing dsh-oauth-copilot

Instructions for an AI agent asked to install, enable or diagnose this plugin in a DeepSeek Harness
(dsh) deployment. Written to be followed mechanically. If a step fails, stop and report — do not
improvise around it.

## 0. Preconditions

```sh
dsh --version      # this release is verified against 0.2.0-rc.2; 0.1.7-rc.2 and 0.2.1-alpha are also in range
node --version     # ^22.19.0 || >=24.0.0
```

Find the target profile: `<DSH_HOME>/profiles/<name>/` (usually `~/.dsh/profiles/`). Ask the user
which profile if it is not obvious.

## 1. Install

```sh
dsh plugin --profile <profile> add dsh-oauth-copilot        # from npm
# or, from a checkout:
npm install && npm run build
dsh plugin --profile <profile> add /path/to/dsh-oauth-copilot
```

**Installing enables it.** Unlike some plugins, this one's bundle patch (`llm-github-copilot`) is an
active insert, not a `disabled: true` row. Restart dsh afterwards.

Confirm it landed in **both** places:

```sh
grep -A4 '"bundles"' <DSH_HOME>/profiles/<profile>/package.json
grep dsh-oauth-copilot <DSH_HOME>/profiles/<profile>/package.json
```

If it is in `dependencies` but not in `bundles`, the install half-failed — remove and add it again.

## 2. Make sure the authorization service is mounted

The model route activates on its own, but the **login machinery** needs the `authorization` service,
which the shipped `dsh-base` profile does not mount. Add to the profile's `cordis.patch.yml`
if the deployment has not already:

```yaml
- insert:
    - id: authorization
      name: '@deepseek-ai/dsh-authorization'
```

A missing service must never take the whole plugin tree down, but login will not work without it.

## 3. Sign-in is a HUMAN-ONLY step — do not attempt it yourself

```sh
npx -y dsh-oauth-copilot login      # prints a device-code URL + code; the human authorizes in a browser
npx -y dsh-oauth-copilot status     # grant expiry + available models
npx -y dsh-oauth-copilot refresh    # re-fetch the account-enabled model list into the grant
npx -y dsh-oauth-copilot logout     # remove the local grant
```

The login flow is deliberately a terminal operation performed by the person: no LLM involvement, so
prompt injection in a non-official model cannot start or drop an authorization. **Ask the user to run
it and to paste back only the command's non-sensitive output.** Never read, print, copy or transmit
the credential file, and never attempt to complete a device-code flow on the user's behalf.

Only **github.com** is supported. GitHub Enterprise is not.

## 4. Verify

```sh
npx -y dsh-oauth-copilot status     # expect a valid grant and a non-empty model list
```

Then, in the model picker of a **new** session, the `github-copilot` provider should be listed.

## Pitfalls — verified the hard way

**A peer-range mismatch silently removes the whole bundle.** dsh evaluates every peer named
```deepseek-ai/dsh``` or prefixed `deepseek-ai/dsh-``` with
`semver.satisfies(host, range, { includePrerelease: true })`; if any is out of range the host skips
the bundle and the `github-copilot` entry simply **vanishes from the picker** — there is no error
dialog. Pay attention to the **upper** bound: `0.3.0-rc.1` is *less than* `0.3.0`, so a range
ending in `<0.3.0` admits the whole 0.3.0 prerelease line. The ranges here end in `<0.3.0-0`,
which is the bound that actually excludes it.

**"model not supported" (HTTP 400) is not a plugin failure.** The picker lists the advisory pi-ai
catalog; not every model is enabled for the signed-in account. Run
`npx -y dsh-oauth-copilot refresh` to store the account-enabled list (`policy=enabled`) into the
grant, then pick again.

**A missing `authorization` service breaks login but not the model route.** If the picker shows the
provider while `login` fails, check step 2.

## Uninstall

```sh
dsh plugin --profile <profile> remove dsh-oauth-copilot
npx -y dsh-oauth-copilot logout
```
