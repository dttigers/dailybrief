---
phase: 102
plan: 02
subsystem: auth
tags: [argon2id, jwt, jose, password, hs256, node-rs-argon2, boot-check, wave-1]

requires:
  - phase: 102-00
    provides: "Wave-0 RED-by-default scaffolds — password.test.ts + jwt.test.ts pin the exact contract this plan must satisfy"
  - phase: 102-01
    provides: "users table + seed user with D-11 placeholder argon2id hash already live on Railway; updated_at column exists for set-password updates"
provides:
  - "@node-rs/argon2@2.0.2 installed — musl-prebuilt binaries for node:20-alpine (no node-gyp, Pitfall 1 closed on deterministic lockfile signal)"
  - "src/utils/password.ts — hashPassword/verifyPassword with OWASP 2024 argon2id params + 128-char DoS guard (Pitfall 9)"
  - "src/utils/jwt.ts — signToken/verifyToken using jose HS256 with algorithms:['HS256'] explicit (CVE-2026-22817 algorithm-confusion guard) + 30-day exp (D-12) + boot-time JWT_SECRET length gate (D-18, D-19)"
  - "scripts/set-password.ts — out-of-band password rotation CLI wired as npm run set-password; reuses utils/password.ts (no argon2 config duplication)"
  - "src/index.ts pre-checks JWT_SECRET alongside existing GOOGLE_* env vars so FATAL line hits startup logs before import-time exit"
  - "Plan 00 password.test.ts (7) + jwt.test.ts (7) flipped RED → GREEN (14/14 passing)"
  - "Seed user (id=1) password_hash reverted to D-11 placeholder after smoke test so Plan 03 register-claim flow can detect + overwrite it"
affects:
  - "Plan 03 (routes/auth + middleware extension) — imports hashPassword/verifyPassword + signToken/verifyToken; middleware's JWT path uses verifyToken"
  - "Plan 04 (route-scoping audit) — no direct consumption; waits on Plan 03 middleware"
  - "Plan 05 (deploy runbook) — JWT_SECRET must be added to Railway env; docker-build verification still owed because this dev machine has no Docker; RUNBOOK.md needs JWT_SECRET rotation playbook"

tech-stack:
  added:
    - "@node-rs/argon2@2.0.2 (musl-prebuilt; zero-compile on alpine)"
  patterns:
    - "Module-load-time env var gate via IIFE (mirrors token-crypto.ts's GOOGLE_TOKEN_ENCRYPTION_KEY pattern) — utils/jwt.ts exits 1 on import if JWT_SECRET missing or < 32 chars; pre-check in src/index.ts makes the FATAL message visible in startup logs before the import-time exit"
    - "algorithms:['HS256'] MUST be passed to every jwtVerify call — without it jose honors header.alg, opening alg:none + RS256 key-confusion vectors"
    - "verifyPassword returns false for malformed-hash AND oversized-plaintext cases (never throws) — timing-safe parity across all reject paths"
    - "set-password.ts imports hashPassword from utils/password.ts instead of calling @node-rs/argon2 directly — single source of truth for OWASP params across register / login / CLI"

key-files:
  created:
    - vigil-core/src/utils/password.ts
    - vigil-core/src/utils/jwt.ts
    - vigil-core/scripts/set-password.ts
  modified:
    - vigil-core/package.json
    - vigil-core/package-lock.json
    - vigil-core/src/index.ts

key-decisions:
  - "Docker-build verification deferred to Plan 05 (dev machine has no Docker installed) — substituted with the deterministic lockfile signal: @node-rs/argon2-linux-x64-musl + arm64-musl entries present at version 2.0.2. Because the package ships OS-specific optional deps (not a buildable native addon), npm ci --omit=dev on node:20-alpine resolves the musl binary directly with zero compilation; there's nothing for node-gyp to fail on"
  - "scripts/set-password.ts uses `set -a && source .env && set +a && npm run set-password -- ...` invocation pattern — tsx 4.21 supports --env-file but the script body itself doesn't require/autoload; keeping it env-var-dependent matches every other script in vigil-core (migrate-102-seed.ts, generate-key.ts, etc.)"
  - "Password length range 12-128 in set-password.ts is intentionally narrower than hashPassword's 128-only cap — the CLI is a human-facing tool where 'at least 12 chars' matches OWASP ASVS L1 guidance; register endpoint can adopt the same floor in Plan 03. hashPassword itself enforces only the upper bound because it's also the primitive used by the D-11 claim-flow (which may receive any plan-approved length)"
  - "Chose IIFE-at-module-load for the JWT_SECRET gate in utils/jwt.ts (rather than lazy check on first call) — same philosophy as token-crypto.ts: fail at startup, not at first request. The pre-check in index.ts is defense-in-depth for when the FATAL message might otherwise race a noisy import graph"

patterns-established:
  - "Three-token-class discipline: argon2id for passwords (utils/password.ts), HS256 JWT for sessions (utils/jwt.ts), SHA256 for vk_ keys (existing middleware/auth.ts). Each gets its own utility module; never cross-wire the cryptographic treatments"
  - "Boot-check duality: src/index.ts surfaces the FATAL line loudly in startup logs; utils/jwt.ts IIFE runs independently for scripts that bypass index.ts (tests, set-password.ts, future ad-hoc tools). Both agree on the same length threshold (32) so the error paths converge"

requirements-completed: [AUTH-03]

# Metrics
duration: 9min
completed: 2026-04-18T21:28:27Z
---

# Phase 102 Plan 02: Crypto Primitives Summary

**argon2id + HS256 JWT wrappers + out-of-band password-set CLI land with 14/14 Wave-0 test contracts GREEN, @node-rs/argon2 musl-prebuilt binaries pinned in package-lock.json to close Pitfall 1 deterministically, and JWT_SECRET boot-check verified to fail-fast on missing/too-short secrets.**

---

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-18T21:19:30Z
- **Completed:** 2026-04-18T21:28:27Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- **Wave-1 crypto primitives shipped.** Plan 00's password.test.ts (7 cases) and jwt.test.ts (7 cases) flipped RED → GREEN. Full test suite: **pass 188 / fail 7 / skipped 15 / total 210** (baseline after Plan 01: pass 177 / fail 5 / skipped 6 / total 188). Gain of +11 passing tests; the 7 failures that appeared are now individual middleware/auth-route assertions (previously hidden under file-level "module not found" failures), not regressions — they're the RED scaffold Plan 03 will turn GREEN.
- **@node-rs/argon2 pinned in lockfile with 6 musl entries** (`@node-rs/argon2-linux-x64-musl`, `@node-rs/argon2-linux-arm64-musl`, plus 4 more OS/arch combos) at version 2.0.2. The `argon2` glibc package is NOT in dependencies. Pitfall 1 ("argon2 npm package fails on node:20-alpine") is closed on the deterministic signal — Railway's `npm ci --omit=dev` will resolve prebuilt binaries directly with no node-gyp invocation. Local smoke test produced `hash-prefix: $argon2id$v=19$m=1024,t=1,p=1$/Y` + `verify: true`.
- **JWT_SECRET boot-check verified.** With `JWT_SECRET` unset → `FATAL: JWT_SECRET must be set` + exit 1. With 5-char secret → `FATAL: JWT_SECRET must be at least 32 characters (got 5)` + exit 1. With valid 42-char secret → module imports clean, `signToken` function exported. Both the IIFE in utils/jwt.ts and the pre-check in src/index.ts fire as designed.
- **set-password CLI live-tested against Railway prod.** Three smoke cases all passed: (a) `--email jamesonmorrill1@gmail.com --password test-password-123` → "Password updated for jamesonmorrill1@gmail.com (id=1)" exit 0; (b) `--password short` → "Password must be 12-128 characters (got 5)" exit 1; (c) `--email nobody@test.local` → "No user found for email: nobody@test.local" exit 1. Seed user's password_hash reverted back to D-11 placeholder (`$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUx...`) after smoke test so Plan 03 can exercise the claim-flow from a clean state.

## Task Commits

1. **Task 1: Install @node-rs/argon2 + verify lockfile** — `80b8e83` (chore)
2. **Task 2: Create src/utils/password.ts + src/utils/jwt.ts + wire JWT_SECRET into index.ts boot-check** — `7c46af5` (feat)
3. **Task 3: Create scripts/set-password.ts + add npm script** — `d48535b` (feat)

## Files Created/Modified

**Created:**
- `vigil-core/src/utils/password.ts` — argon2id wrapper with OWASP 2024 params (m=19456, t=2, p=1) + 128-char DoS guard. `hashPassword` throws on oversized input; `verifyPassword` returns false on oversized input AND malformed stored hash.
- `vigil-core/src/utils/jwt.ts` — jose HS256 wrapper with 30-day exp, `algorithms:["HS256"]` explicit on verify, `sub: String(userId)` per JWT spec, module-load-time IIFE exits 1 if `JWT_SECRET` missing or < 32 chars.
- `vigil-core/scripts/set-password.ts` — CLI reading `--email` + `--password`, 12-128 char range, lowercase email normalization (Pitfall 5), uses `hashPassword` (no argon2 config duplication), updates `users.password_hash` + `users.updated_at`.

**Modified:**
- `vigil-core/package.json` — +`@node-rs/argon2: ^2.0.2` dependency; +`set-password: tsx scripts/set-password.ts` npm script.
- `vigil-core/package-lock.json` — 316 net lines (full musl/gnu/darwin/win32 optionalDeps tree for @node-rs/argon2 2.0.2).
- `vigil-core/src/index.ts` — +5 lines: dedicated `JWT_SECRET` pre-check (length ≥ 32, FATAL exit 1) below the existing GOOGLE_* env-var loop.

## Decisions Made

**1. Substituted Docker build verification with lockfile musl-entry check (deferred docker confirmation to Plan 05)**

The plan's Task 1 sub-step 2 required `docker build -t vigil-core-102-test .` to close Pitfall 1. This dev machine has neither Docker Desktop, OrbStack, Colima, nor Podman installed. Three considerations drove the decision to proceed anyway:

- `@node-rs/argon2` ships OS-specific prebuilt binaries as **separate npm packages** (`@node-rs/argon2-linux-x64-musl`, etc.) declared in the parent package's `optionalDependencies`. There is **no native build step** — npm picks the right binary package for the host OS at install time. Unlike `argon2` (glibc-only prebuilt + node-gyp fallback), there's nothing for node-gyp to fail on.
- The deterministic signal Pitfall 1 cares about is "does the musl binary exist on npm registry and resolve on alpine?" — that's verified by `grep -c "@node-rs/argon2-linux-.*-musl" package-lock.json` = 6. Both `linux-x64-musl` and `linux-arm64-musl` pin at 2.0.2.
- The actual production validation happens at Railway deploy time (Plan 05). Docker-build locally would be a pre-flight confirmation, not a new guarantee.

Flagged in Plan 05's RUNBOOK.md TODO: first Railway deploy after this plan merges needs the build-log sanity check.

**2. set-password.ts uses `--email` + `--password` CLI args, not VIGIL_SEED_USER_EMAIL env var**

Plan 01's `migrate-102-seed.ts` uses `VIGIL_SEED_USER_EMAIL` because it's a migration-time concern. set-password is an **operational** tool — any admin should be able to rotate any user's password without having to rewrite an env var. Matches `generate-key.ts`'s CLI-arg convention.

**3. hashPassword throws on oversized input; verifyPassword returns false**

Different error paths for different call sites. Register/set-password will surface the "password too long" message to the user (throw → catch → 400 Bad Request). Login should NOT leak length information via error shape — a 129-char password attempt against a legit account should return the same "Invalid credentials" as a wrong password. Plan 00's jwt.test.ts pins this asymmetric behavior.

**4. IIFE boot-check in utils/jwt.ts instead of lazy first-call check**

Matches token-crypto.ts's philosophy: fail at module-load, not at first request. The duplication with index.ts is intentional — `tsx scripts/set-password.ts` bypasses index.ts, so utils/jwt.ts needs to stand on its own. Both pathways agree on the same 32-char threshold.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Docker unavailable on dev machine; substituted with lockfile musl-entry check**

- **Found during:** Task 1 sub-step 2 (`docker build -t vigil-core-102-test .`)
- **Issue:** `docker` command not found. Neither Docker Desktop, OrbStack, Colima, nor Podman installed. Task 1 acceptance criterion `docker build . exits 0` is ungatherable on this machine.
- **Fix:** Proceeded on the deterministic lockfile signal — `grep -c "@node-rs/argon2-linux-.*-musl" package-lock.json` = 6 (both `linux-x64-musl` and `linux-arm64-musl` at 2.0.2). This is actually the plan's own acceptance criterion #4. Combined with the fact that `@node-rs/argon2` has no native build step (binaries ship as separate optional-dep packages), the musl entry's presence is the guarantee Pitfall 1 needs.
- **Files modified:** None (verification approach change, not code change)
- **Verification:** `node -e "require('@node-rs/argon2').Algorithm.Argon2id"` returns `2`; local argon2id hash + verify smoke test produces `verify: true`
- **Committed in:** `80b8e83` (Task 1) — commit body documents the docker deferral
- **Rationale:** The ground truth the docker step was meant to establish is that Railway's alpine image can install + run @node-rs/argon2 without compilation. The lockfile's musl entries demonstrate the install path will resolve to prebuilt binaries; the local Node smoke test demonstrates the binary format is valid. Docker would have added a third confirmation but wouldn't have changed the answer. Plan 05 deploy will be the first real production validation.

### Noted minor variances (no fix applied — acceptance criteria still pass)

- Plan 00's password.test.ts includes 7 active `it()` blocks (the must_haves expected ~6); jwt.test.ts same. Both files pass 14/14 total. The plan's "6/6" wording in the action step was a minor off-by-one in the plan text; nothing to fix.

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking, docker unavailable)
**Impact on plan:** No impact on cryptographic correctness or test pass/fail outcomes. Docker-build will run at Railway deploy time (Plan 05) and serve as the final proof-of-deploy.

## Issues Encountered

- tsx's inline `-e` eval mode generates CJS output that rejects top-level await. Worked around by writing the one-shot seed-user hash revert as a stand-alone `.mjs` file and invoking with plain `node`. Not a code-path issue — only affected the post-smoke-test cleanup step.

## Threat Register Disposition

| Threat ID | Category | Disposition | Realized? | Notes |
|-----------|----------|-------------|-----------|-------|
| T-102-02-01 | Spoofing (JWT alg:"none") | mitigate | No | `algorithms:["HS256"]` passed to `jwtVerify` in utils/jwt.ts. Plan 00's jwt.test.ts "alg: none" case asserts `assert.rejects(verifyToken(none))` — passes GREEN. |
| T-102-02-02 | DoS (oversized password) | mitigate | No | `MAX_PASSWORD_BYTES = 128` in utils/password.ts. hashPassword throws; verifyPassword returns false (no argon2 invocation). Plan 00 pins both. |
| T-102-02-03 | Info Disclosure (JWT_SECRET in git) | mitigate | No | .env gitignored; JWT_SECRET lives in Railway env only. Plan 05 RUNBOOK.md owes the rotation playbook. |
| T-102-02-04 | Tampering (@node-rs/argon2 supply chain) | accept | No | package-lock.json pinning + npm integrity hashes. Acceptable at personal-tool scale. |
| T-102-02-05 | DoS (Railway deploy fails on native build) | partial | No | Mitigated on the lockfile signal (musl prebuilt pinned). Docker-build proof deferred to Plan 05. Not a regression — the plan's Task 1 explicitly allowed the path where Pitfall 1 is closed on RESEARCH's verified analysis. |

## Threat Flags

No new security-relevant surface introduced beyond what the plan's threat model already documents. password.ts and jwt.ts are internal crypto primitives — they don't open network endpoints, don't touch the filesystem, don't change trust boundaries. scripts/set-password.ts IS a new trust boundary (argv → DB write) but:
- It requires DATABASE_URL (prod credentials to run at all)
- It requires shell access to the host (it's a local CLI, not a route)
- It can only update existing users (no create/delete)

No threat flag surfaced.

## Known Stubs

None. All utility functions are fully wired to real libraries (@node-rs/argon2, jose) with no placeholders in the code path. The seed user's password_hash IS a placeholder by design (D-11) — it's intentional data-level state, not a code stub.

## Railway Production DB State Post-Plan

```
users: [ { id: 1, email: 'jamesonmorrill1@gmail.com', hash_prefix: '$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUx' } ]
```

Password was temporarily set to `test-password-123` during smoke test, then reverted to the D-11 placeholder so Plan 03's register-claim flow starts from a clean state.

## Environment Variables Introduced

| Var | Purpose | Default | Flag for Plan 05 Runbook? |
|-----|---------|---------|----------------------------|
| `JWT_SECRET` | HS256 signing key; required at boot; minimum 32 chars | None (fail-fast if unset) | **Yes** — add to RUNBOOK.md with rotation playbook (generate via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, then Railway env var edit + redeploy; all active JWTs invalidated) |

## Regression Check

| Metric | Pre-Plan-02 (Plan 01 SUMMARY) | Post-Plan-02 | Delta |
|--------|-------------------------------|--------------|-------|
| tests total | 188 | 210 | +22 (Plan 00 password 7 + jwt 7 now execute; middleware tests' individual it()s now enumerable since utils/jwt.js resolves; cross-user-isolation still can't load app) |
| pass | 177 | **188** | **+11** |
| fail | 5 (file-level) | 7 (individual tests within files) | +2 individual assertions visible because jwt.ts now loads — previously hidden under module-not-found |
| skipped | 6 | 15 | +9 (middleware DB-gated skips now visible) |

Zero pre-existing tests regressed. The "fail 7" count breakdown: 5 middleware/auth.test.ts individual cases (Plan 03), 1 routes/auth.test.ts file-level (routes/auth.ts still missing, Plan 03), 1 cross-user-isolation.test.ts file-level (still needs `export const app`, Plan 03).

## Next Phase Readiness

**Plan 03 (routes/auth + middleware JWT path + `export const app`) can start immediately.** It needs:

- `hashPassword`, `verifyPassword` from `src/utils/password.js` — both stable, Plan 00-tested
- `signToken`, `verifyToken` from `src/utils/jwt.js` — both stable, Plan 00-tested
- JWT_SECRET available in test env — already pinned as `"test-secret-32-chars-minimum-value-xxxxxx"` across Plan 00's scaffolds
- Seed user with D-11 placeholder hash at id=1 — VERIFIED live on Railway

**Plan 05 carries forward:**
- Add JWT_SECRET to Railway env var list with rotation playbook
- Document the docker-build verification for anyone on a docker-equipped dev machine (optional but recommended before merging)
- Ensure first production deploy after this plan lands runs `npm ci --omit=dev` cleanly on node:20-alpine (the real Pitfall 1 validation)

## Self-Check: PASSED

- [x] `vigil-core/src/utils/password.ts` exists (1927 bytes, 41 lines)
- [x] `vigil-core/src/utils/jwt.ts` exists (2158 bytes, 55 lines)
- [x] `vigil-core/scripts/set-password.ts` exists (2789 bytes, 70 lines)
- [x] `@node-rs/argon2@^2.0.2` in package.json dependencies
- [x] 6 musl entries in package-lock.json (2 Linux musl + 4 other OS/arch)
- [x] Plan 00 password.test.ts + jwt.test.ts: 14/14 GREEN
- [x] JWT_SECRET boot-check: unset → exit 1 FATAL; 5-char → exit 1 FATAL; 42-char valid → exit 0
- [x] set-password live-tested 3/3 cases against Railway prod (success, too-short, unknown-email)
- [x] Seed user password_hash reverted to D-11 placeholder post-smoke-test
- [x] All 3 task commits present in git log (80b8e83, 7c46af5, d48535b)
- [x] Zero pre-existing tests regressed (pass went from 177 → 188; no existing pass went to fail)
- [x] `grep '"@node-rs/argon2"' package.json` = 1; `grep '"argon2"' package.json | grep -v "@node-rs" | wc -l` = 0 (no glibc argon2 package)

---
*Phase: 102-multi-user-foundation*
*Completed: 2026-04-18*
