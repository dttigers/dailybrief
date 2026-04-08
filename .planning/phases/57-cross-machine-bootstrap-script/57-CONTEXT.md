# Phase 57 Context — Cross-machine bootstrap script

**Promoted from backlog 999.1 on 2026-04-08.**

## Why this exists

Surfaced from Phase 52 retro (2026-04-07) discussion of cross-machine portability. Currently `git pull` only gives committed code — secrets, the launchd service, and build artifacts are all local-only and have to be set up by hand. Per the `project_secret_drift` memory, this is exactly the kind of thing that drifts and breaks silently.

## What it would do

- Copy `~/.config/dailybrief/config.json` from a known location (encrypted backup? 1Password CLI? iCloud Drive synced folder?) — contains `claude_api_key`, Vigil bearer token, gmail app password, IMAP/OAuth creds
- Copy `~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist` (contains `ANTHROPIC_API_KEY`)
- `cd vigil-core && npm install && npm run build`
- `swift build` for the Mac apps (or open the Xcode project)
- `launchctl load ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist`
- Prompt for `railway login`, `gh auth login`, `claude` CLI auth
- Verify: hit `http://localhost:3001/v1/health`, confirm DailyBrief CLI binary built, confirm Monitor app launches

## Open questions for /gsd-discuss-phase

- Where do the secrets live in transit? (1Password vault is the obvious answer; iCloud Drive is easier but less secure for an API-key file)
- Should it also clone the repo, or assume `git clone` already happened?
- Do we want a `dailybrief-doctor` companion command that diagnoses an existing setup (drift detection across the 4 places API keys live)?
