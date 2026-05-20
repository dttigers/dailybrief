---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge
reviewed: 2026-05-19T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - vigil-linux-hooks/vigil-agent-bridge.sh
  - vigil-linux-hooks/redact.sh
  - vigil-linux-hooks/redaction-patterns.json
  - vigil-linux-hooks/install.js
  - vigil-linux-hooks/install.sh
  - vigil-linux-hooks/README.md
  - vigil-linux-hooks/__tests__/body-builder.test.ts
  - vigil-linux-hooks/__tests__/fail-safe.test.ts
  - vigil-linux-hooks/__tests__/redaction-corpus.test.ts
  - vigil-linux-hooks/__tests__/redaction-drift.test.ts
  - vigil-linux-hooks/__tests__/installer-idempotency.test.ts
  - vigil-linux-hooks/__tests__/fixtures/probe-envelope.json
  - vigil-linux-hooks/__tests__/fixtures/settings.json
findings:
  critical: 3
  warning: 7
  info: 4
  total: 14
status: issues_found
---

# Phase 134: Code Review Report

**Reviewed:** 2026-05-19
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The Phase 134 mini-package delivers a tight, well-instrumented Linux Claude Code → Vigil Core bridge. The fail-safe contract (auth-gate early exit, `nohup`/`disown` curl pattern, redactor binary-redaction) is implemented thoughtfully and the test corpus is genuinely strong. The redaction subsystem is well-tested and the `truncate-FIRST` ordering is defensible.

That said, the review surfaces **three BLOCKER-class findings** that should be fixed before the operator burns hardware-UAT cycles (Phase 130 lesson: feedback_code_review_before_hardware_uat):

1. **CR-01 — API key leaked to process argv on every curl invocation** (T-134-A1 breach). Every Linux user on the workstation can `cat /proc/<pid>/cmdline` while curl is in flight and recover the full `vk_` bearer token. The hook fires on every prompt and session start; this is the operator's real workstation; this is a real-world infosec issue.
2. **CR-02 — `COMMAND_REGEX` in install.js is unanchored** (T-134-I2 risk). The uninstall regex `/vigil-agent-bridge\.sh.*--event=/` is not anchored to the start of the command string. A future GSD or third-party hook whose command merely *contains* the substring `vigil-agent-bridge.sh` plus `--event=` anywhere would be silently dropped on uninstall.
3. **CR-03 — `settings.json` mode bits not preserved across atomic write** (T-134-I1 hardening gap). The atomic-write helper writes the tmp file with default umask (typically 0644) and renames over the original. If the operator hardened `~/.claude/settings.json` to mode 0600, the install/uninstall round-trip silently widens it to world-readable.

Seven WARNING-level findings cover hardcoded node path, missing platform guard, observability gaps, over-broad redaction, brittle assumptions on Claude Code stdin behavior, and a settings.local.json blind spot. Four INFO items cover minor documentation/test hygiene.

Recommend fixing all three Critical findings before hardware UAT; Warnings can be addressed in a follow-up phase if Critical fixes ship clean.

## Critical Issues

### CR-01: API key leaked to process argv via curl `--header` argument

**File:** `vigil-linux-hooks/vigil-agent-bridge.sh:111`
**Issue:** The curl invocation passes the bearer token as a CLI argument:
```bash
--header "Authorization: Bearer $VIGIL_API_KEY"
```
Once the `nohup curl ... &` process forks, the full token is visible in `/proc/<pid>/cmdline` to ANY local user (`ps auxww`, `cat /proc/<pid>/cmdline`). On a multi-user Linux workstation — or any environment with even a single compromised local process — the bearer token is recoverable for the full duration of the curl (`--max-time 2`, but the hook fires on every prompt). The hook fires under EVERY user prompt and EVERY session start; this is exactly the threat model T-134-A1 names ("zero unconditional echo/printf to terminal"), and the argv leak bypasses every stderr/stdout discipline elsewhere in the script.

This is the operator's REAL workstation against the Railway production endpoint. Treat as a real breach.

**Fix:** Pass the Authorization header via stdin using `curl -K -` (config file on stdin) or `curl --header @-` semantics. Recommended pattern:

```bash
# Build header file content in a here-string; curl reads from stdin, never argv.
nohup curl \
  --max-time 2 --silent --output /dev/null --fail \
  --config - \
  --header "Content-Type: application/json" \
  --data "$body" \
  "$VIGIL_API_URL/v1/agent-events" \
  <<< "header = \"Authorization: Bearer $VIGIL_API_KEY\"" \
  >/dev/null 2>&1 &
disown
```

Note that the here-string approach replaces the `</dev/null` redirect; verify the stdio inheritance fix still holds (Plan 02 `nohup`/`disown` pattern). An alternative is to write the header to a tmpfile with mode 0600 and pass `-K /path/to/tmpfile` (cleaning up after — though fire-and-forget makes cleanup tricky; prefer here-string).

After fix, add a regression test that source-greps `vigil-agent-bridge.sh` for any line matching `--header.*Authorization.*VIGIL_API_KEY` and FAILS the test. The same regression guard catches future commits that re-introduce the argv leak.

---

### CR-02: Uninstall regex `COMMAND_REGEX` is unanchored — risks deleting non-Vigil hooks

**File:** `vigil-linux-hooks/install.js:47`
**Issue:** The regex used to identify uninstall targets is not anchored:
```javascript
const COMMAND_REGEX = /vigil-agent-bridge\.sh.*--event=/;
```
Any hook command that contains the substring `vigil-agent-bridge.sh` followed by `--event=` anywhere — including a hypothetical future GSD wrapper like `bash gsd-vigil-agent-bridge.sh-watcher --event=foo` or a documentation/wrapper script someone writes — would match this regex and be silently deleted on uninstall.

The T-134-I2 mitigation contract is: "only OUR entries match the filter." The current regex matches a superset.

The install path also uses `COMMAND_REGEX.test(h.command) && h.command.includes(`--event=${event}`)` (line 117-119), which is two filters AND'd together — but that AND only narrows on install. On uninstall (line 86), only the regex is applied, no anchor.

**Fix:** Anchor the regex to the exact command shape that install.js writes (line 127: `` `bash ${hookPath} --event=${event}` ``). The command always starts with `bash`, contains an absolute path ending in `/vigil-agent-bridge.sh`, then a literal space and `--event=` followed by exactly one of the three event names:

```javascript
const COMMAND_REGEX = /^bash\s+\S+\/vigil-agent-bridge\.sh\s+--event=(SessionStart|UserPromptSubmit|Stop)\s*$/;
```

This anchors to the line start, requires `bash` as the first token, and pins the event name to the allowlist. False-positive surface area shrinks to ~zero.

Add a regression test to `installer-idempotency.test.ts` that inserts a decoy entry like `bash my-wrapper-around-vigil-agent-bridge.sh-tool --event=foo` into the fixture, runs uninstall, and asserts the decoy SURVIVES.

---

### CR-03: Atomic-write helper does not preserve `settings.json` permissions

**File:** `vigil-linux-hooks/install.js:70-74`
**Issue:** The atomic write helper writes the tmp file with Node's default umask permissions (typically 0644 on Linux) and renames over the original:
```javascript
function atomicWriteSettings() {
  const tmp = settingsPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, settingsPath);
}
```

If the operator hardened `~/.claude/settings.json` to mode 0600 (a reasonable hygiene step on a multi-user box), the first install or uninstall silently widens it to 0644 / world-readable. The settings file may contain operator hints, paths, or future MCP credentials — preserving the original mode is the principle-of-least-surprise contract for a mutator that documents itself as "byte-for-byte preserving."

T-134-I1 names this directly: "atomic write + refuse-to-write on parse failure." The atomic-write contract should extend to "preserve mode bits."

**Fix:** Stat the original file before write, chmod the tmp file to the same mode before rename:

```javascript
function atomicWriteSettings() {
  const tmp = settingsPath + ".tmp";
  let mode = 0o644;
  try {
    mode = fs.statSync(settingsPath).mode & 0o777;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    // First-time install — settings.json doesn't exist yet; use restrictive default.
    mode = 0o600;
  }
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, settingsPath);
}
```

Add a regression test that pre-chmods the fixture settings.json to 0600, runs install, and asserts `(statSync(settingsPath).mode & 0o777) === 0o600`.

---

## Warnings

### WR-01: `install.sh` hardcodes `/usr/bin/node` — breaks under nvm/asdf/Homebrew

**File:** `vigil-linux-hooks/install.sh:3`
**Issue:** The shim hardcodes the node binary path:
```bash
exec /usr/bin/node "$(dirname "$0")/install.js" "$@"
```
On systems using nvm, asdf, mise, fnm, or Homebrew (very common on dev workstations), node is at `~/.nvm/versions/node/vXX/bin/node`, `/opt/homebrew/bin/node`, etc. — not `/usr/bin/node`. Install fails with "No such file or directory" before even reading the JS. The README claims "Node 18+" without specifying which install method.

**Fix:** Use the PATH:
```bash
exec node "$(dirname "$0")/install.js" "$@"
```
Add a guard above the exec for a clearer error:
```bash
if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found in PATH. Install Node 18+ (nvm, asdf, brew, or system package) and re-run." >&2
  exit 1
fi
```

---

### WR-02: `vigil-agent-bridge.sh` blocks in `cat` if Claude Code never closes stdin

**File:** `vigil-linux-hooks/vigil-agent-bridge.sh:38`
**Issue:** Line 38 `INPUT=$(cat)` reads stdin until EOF. The whole `nohup curl … & disown` fire-and-forget machinery is at line 109, AFTER stdin has been fully consumed. If Claude Code v2.1.87+ has a regression where it does not close stdin promptly (the exact bug install.js mitigates via `async:true`+`timeout:5`), the hook process hangs at `cat` until Claude Code's 5s SIGKILL.

`async:true` does mean Claude Code doesn't WAIT for the hook — so the user experience is not stalled. But the hook process is zombied/leaked until SIGKILL. Over a long session this creates dozens of stuck bash processes. The fail-safe contract is met (no UX stall), but the process hygiene is poor.

**Fix:** Add an explicit stdin timeout via `read` + `timeout`:
```bash
INPUT=$(timeout 1 cat 2>/dev/null) || INPUT=""
```
If stdin doesn't close within 1 second, treat the envelope as empty and let the existing `[ -z "$SESSION_ID" ] && exit 0` safety net fire. This guarantees the hook process self-terminates regardless of Claude Code's stdin behavior.

---

### WR-03: `install.js` is blind to `settings.local.json`

**File:** `vigil-linux-hooks/install.js:36`
**Issue:** Claude Code reads BOTH `~/.claude/settings.json` and `~/.claude/settings.local.json` (the latter is git-ignored by convention and used for machine-local overrides). install.js only mutates `settings.json`. If the operator has hooks in `settings.local.json`, the verify-step in README (`grep -c vigil-agent-bridge ~/.claude/settings.json` → 3) succeeds, but the bridge entries may be shadowed/overridden by `settings.local.json` content the operator forgot about.

This is a real risk because Phase 130 G2 + GSD workflows have been encouraging operators to use `settings.local.json` for machine-specific tweaks.

**Fix:** At minimum, add a one-line README warning: "If you have `~/.claude/settings.local.json` with `hooks.SessionStart` entries, those override `settings.json`. Either remove them or splice the bridge entry into `settings.local.json` manually." A more thorough fix is to detect the file and refuse to install with a clear message until the operator confirms. Given Phase 134 scope, the README warning is sufficient.

---

### WR-04: `password` and `bearer` patterns over-redact common English

**File:** `vigil-linux-hooks/redaction-patterns.json:5-6`
**Issue:** The patterns `bearer` and `password` are bare lowercase substrings. Prompts like:
- `what's the difference between a password and a passphrase`
- `explain bearer token semantics in RFC 6750`
- `is my password manager secure`

...all get redacted to the binary literal. The Vigil Core HUD will then show `[redacted: contains sensitive pattern]` for prompts that contained zero actual secrets. Over-redaction degrades observability (the HUD's whole value prop). It may also confuse the operator during UAT — they'll see a redaction-literal heartbeat and assume the redactor "worked" when the prompt was benign.

The threat model accepts over-redaction (binary-redaction by design), but these two patterns are aggressive enough that EVERY conversation about authentication, security, or password managers gets redacted.

**Fix (acceptable for v1):** Document the over-redaction explicitly in README so the operator's mental model matches reality:
```markdown
The redactor is intentionally aggressive. Prompts containing the literal substrings
`bearer`, `password`, `api_key`, `api-key`, `apikey`, or `vk_` are ALWAYS redacted
even when used in non-secret context (e.g., "explain bearer tokens"). This is the
binary-redaction contract — false-positive redaction is preferred over false-negative
secret exposure.
```
**Fix (deferred to v2):** Tighten patterns to require a context cue, e.g., `password\s*[:=]` (only on assignment-shape), `bearer\s+ey` (only on bearer-followed-by-JWT), etc. Defer until Phase 133 redactor parity coordination.

---

### WR-05: Hook source path resolved via `$0` is brittle to symlink topology

**File:** `vigil-linux-hooks/vigil-agent-bridge.sh:25`
**Issue:** Line 25 uses `$(dirname "$0")` to locate redact.sh:
```bash
source "$(dirname "$0")/redact.sh"
```
`$0` for a hook invoked as `bash /full/path/to/vigil-agent-bridge.sh --event=...` is `/full/path/to/vigil-agent-bridge.sh`. `dirname` strips to the directory. This works for the documented install location.

However: if the operator symlinks the hook (e.g., `~/.claude/hooks/vigil-agent-bridge.sh -> ~/dev/dailybrief/vigil-linux-hooks/vigil-agent-bridge.sh`), `$0` is the symlink path, `dirname` returns `~/.claude/hooks`, and the script looks for `~/.claude/hooks/redact.sh` — which only exists if redact.sh was ALSO copied (which install.js does). So in practice, install.js's "copy all three files" model insulates against this. Acceptable.

**Concern:** if the operator manually edits the hook command in settings.json to invoke the source repo path directly (skipping install.js's copy step), `dirname "$0"` correctly points to the source repo. This is fine.

**Fix:** Replace `$0` with `${BASH_SOURCE[0]}` (which redact.sh already uses on line 26):
```bash
source "$(dirname "${BASH_SOURCE[0]}")/redact.sh"
```
`BASH_SOURCE[0]` survives source-vs-exec ambiguity and is the canonical bash idiom. Low-risk hardening.

---

### WR-06: `body-builder.test.ts` `captureBody` shell-quote escape is fragile

**File:** `vigil-linux-hooks/__tests__/body-builder.test.ts:76`
**Issue:** The fixture JSON is escaped with `stdinJson.replace(/'/g, "'\\''")` and interpolated into a shell command via template literal. The escape is correct for the standard single-quote-in-single-quoted-string idiom. But it does NOT handle:
- NUL bytes (none in fixture — safe today)
- Already-escaped sequences that bash double-processes
- Trailing newlines

The fixture content today is hand-controlled JSON, so this works. If a future commit adds a Pitfall-4-style fixture with embedded backslash + single-quote sequences, the escape may silently mis-interpret.

**Fix:** Pipe stdin via execSync's `input` option instead of shell interpolation:
```typescript
const stdout = execSync(`bash '${HOOK_PATH}' --event=${eventType} 2>/tmp/vigil-bb-test-stderr`, {
  env, shell: "/bin/bash", encoding: "utf8",
  input: stdinJson,
});
```
This eliminates the shell-quote escape entirely. `redaction-corpus.test.ts` already uses this pattern via execFileSync's args[] — body-builder should mirror it.

---

### WR-07: No platform guard — installer/hooks documented as Linux-only but never check

**File:** `vigil-linux-hooks/install.js:31-46` and `vigil-linux-hooks/vigil-agent-bridge.sh:63`
**Issue:** README and CONTEXT clearly scope this as Linux-only. The hook fallback for UUID uses `/proc/sys/kernel/random/uuid` (line 63), which is Linux-specific (does not exist on macOS or BSD). install.js has no `process.platform === "linux"` guard. If a macOS operator accidentally runs `bash vigil-linux-hooks/install.sh`, the install succeeds — and then every hook invocation hits the `uuidgen || cat /proc/...` chain. `uuidgen` exists on macOS too, so it works most of the time, but if uuidgen is unavailable (some Linux minimal containers), the Linux fallback is silently absent on non-Linux.

**Fix:** Add a platform guard at the top of install.js:
```javascript
if (process.platform !== "linux") {
  process.stderr.write(`error: vigil-linux-hooks is Linux-only (detected platform: ${process.platform}). Use vigil-watch for macOS.\n`);
  process.exit(1);
}
```
And mirror in install.sh:
```bash
if [ "$(uname -s)" != "Linux" ]; then
  echo "error: vigil-linux-hooks is Linux-only. Detected: $(uname -s). Use vigil-watch for macOS." >&2
  exit 1
fi
```

---

## Info

### IN-01: Round-trip uninstall is NOT byte-for-byte equal to pre-install state

**File:** `vigil-linux-hooks/README.md:124-126` + `install.js:111`
**Issue:** install.js line 111 (`settings.hooks[event] ??= [];`) CREATES the `hooks.UserPromptSubmit` and `hooks.Stop` keys on install (the fixture has them absent). After uninstall, the filter leaves them as empty arrays `[]` per CONTEXT D-N2. So the pre-install state (key absent) and post-uninstall state (key present as `[]`) are NOT byte-equal. The README implies preservation; the test (`installer-idempotency.test.ts:218-231`) confirms the current behavior.

**Fix:** Update README to clarify the contract:
```markdown
Removes the three hook entries from `~/.claude/settings.json` AND the three runtime
files from `~/.claude/hooks/`. GSD entries and other matcher groups are preserved
byte-for-byte. The `hooks.UserPromptSubmit` and `hooks.Stop` keys are retained as
empty arrays (intentional per D-N2 — leaves room for other tools to splice in
later). Note: if these keys were ABSENT before install, they will exist as empty
arrays after uninstall — full round-trip is not byte-identical.
```

---

### IN-02: `body-builder.test.ts` writes to fixed `/tmp/vigil-bb-test-stderr`

**File:** `vigil-linux-hooks/__tests__/body-builder.test.ts:76, 89`
**Issue:** The test uses a hardcoded tmpfile path `/tmp/vigil-bb-test-stderr`. Parallel test runs (e.g., `npx tsx --test __tests__/*.test.ts` running concurrently) race on this path. The test framework's node:test runs serially within a file but parallelizable across files; another test that reads the same path would conflict.

**Fix:** Use `mkdtempSync` (the installer-idempotency test does):
```typescript
const stderrFile = mkdtempSync(join(tmpdir(), "vigil-bb-")) + "/stderr";
```

---

### IN-03: Redaction patterns file is re-read from disk on every prompt

**File:** `vigil-linux-hooks/redact.sh:36-44`
**Issue:** `load_patterns()` shells out to `node -e` to read+parse the JSON file on every `redact_prompt` invocation — i.e., once per UserPromptSubmit. This is O(1) work per prompt but spawns a node process per call. For an interactive session with hundreds of prompts, this is non-trivial overhead (~30-50ms per prompt for node cold-start).

**Note:** Performance issues are out of v1 review scope. Filed as INFO for visibility only; do NOT block on this.

**Fix (deferred):** Cache patterns in a bash array at source time:
```bash
_VIGIL_PATTERNS_CACHE="$(load_patterns)"
redact_prompt() {
  ...
  local IFS=$'\x01'
  for pat in $_VIGIL_PATTERNS_CACHE; do ...
}
```

---

### IN-04: `--fail` curl flag silently swallows HTTP 401 — observability gap

**File:** `vigil-linux-hooks/vigil-agent-bridge.sh:109-115`
**Issue:** The curl `--fail --silent --output /dev/null` combo means a 401 (bad/expired API key) is indistinguishable from a 200 from the operator's perspective. The debug log (`/tmp/vigil-agent-bridge.log`) records that the hook fired but says nothing about HTTP status. The operator can re-validate via the manual probe in README, but during UAT they may waste cycles debugging "why aren't events appearing" when the answer is simply "your VIGIL_API_KEY is bad."

This is documented as the fire-and-forget contract, so it's intentional. INFO only.

**Fix (deferred):** Optionally extend the debug log to capture curl's exit code when `VIGIL_AGENT_BRIDGE_DEBUG=1`. Requires foregrounding the curl (incompatible with fire-and-forget). Better: add a separate `vigil-bridge-probe` CLI for the operator to validate API key + endpoint reachability without going through the hook path.

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
