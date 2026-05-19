// Phase 134 Plan 01 Task 1 — Wave 0 fail-safe tests.
//
// Mirror of: vigil-core/src/__tests__/migration-drift.test.ts:37-46 (node:test
// imports + execSync + env override pattern — the canonical model in vigil-core
// for shell-spawn tests with assertions on captured stderr/stdout/exit).
//
// These five tests verify AGENT-LINUX-04 invariants: silent exit-0 on every
// failure mode (missing API key, unreachable server, malformed STDIN JSON,
// missing envelope fields) and zero unconditional echo/printf to terminal
// outside the gated debug-log path.
//
// Wave-0 state: all five tests are expected to FAIL until Task 2 lands the
// hook script. Task 2 turns them GREEN.
//
// Run: cd vigil-linux-hooks && npx tsx --test __tests__/fail-safe.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// __tests__/fail-safe.test.ts → vigil-linux-hooks/ is one level up
const HOOKS_ROOT = join(here, "..");
const HOOK_PATH = join(HOOKS_ROOT, "vigil-agent-bridge.sh");

describe("AGENT-LINUX-04 — fail-safe posture (exit 0 + zero stderr)", () => {
  it(
    "missing VIGIL_API_KEY — exits 0 with zero stderr",
    { timeout: 5_000 },
    () => {
      const env = { ...process.env, VIGIL_API_KEY: "" };
      // 2>&1 conflates streams into one buffer; trailing "exit=$?" tags the
      // exit code so we can assert on it without execSync throwing.
      const result = execSync(
        `printf '{"session_id":"abc","cwd":"/tmp"}' | bash '${HOOK_PATH}' --event=SessionStart 2>&1; echo "exit=$?"`,
        { env, shell: "/bin/bash", encoding: "utf8" },
      );
      assert.match(result, /exit=0/, "hook must exit 0 when VIGIL_API_KEY is empty");
      // Strip the trailing "exit=0\n" sentinel; what remains must be EMPTY
      // (no stderr, no stdout) per AGENT-LINUX-04 D-A4.
      const remainder = result.replace(/exit=0\n?$/, "").trim();
      assert.equal(
        remainder,
        "",
        `hook must emit zero stderr/stdout when API key missing (got: ${JSON.stringify(remainder)})`,
      );
    },
  );

  it(
    "network failure — unreachable VIGIL_API_URL exits 0 within 3s",
    { timeout: 5_000 },
    () => {
      const env = {
        ...process.env,
        VIGIL_API_KEY: "vk_test_0000000000000000000000000000000000000000000000000000000000000000",
        // Port 1 is the TCPMUX well-known port — almost always closed; curl
        // gets an immediate ECONNREFUSED, well inside the --max-time 2 budget.
        VIGIL_API_URL: "http://127.0.0.1:1",
      };
      const t0 = Date.now();
      const result = execSync(
        `printf '{"session_id":"abc","cwd":"/tmp"}' | bash '${HOOK_PATH}' --event=SessionStart 2>&1; echo "exit=$?"`,
        { env, shell: "/bin/bash", encoding: "utf8" },
      );
      const elapsed = Date.now() - t0;
      assert.match(result, /exit=0/, "hook must exit 0 even when API is unreachable");
      // The curl is fire-and-forget (`nohup … & disown`), so the hook itself
      // exits well before --max-time 2 fires. 3000ms is a generous cap.
      assert.ok(
        elapsed < 3000,
        `hook must exit within 3s (fire-and-forget); took ${elapsed}ms`,
      );
    },
  );

  it(
    "malformed STDIN JSON — exits 0 silently",
    { timeout: 5_000 },
    () => {
      const env = {
        ...process.env,
        VIGIL_API_KEY: "vk_test_0000000000000000000000000000000000000000000000000000000000000000",
        VIGIL_API_URL: "http://127.0.0.1:1",
      };
      const result = execSync(
        `printf 'not json at all' | bash '${HOOK_PATH}' --event=SessionStart 2>&1; echo "exit=$?"`,
        { env, shell: "/bin/bash", encoding: "utf8" },
      );
      assert.match(result, /exit=0/, "hook must exit 0 on malformed STDIN");
      const remainder = result.replace(/exit=0\n?$/, "").trim();
      assert.equal(
        remainder,
        "",
        `malformed STDIN must produce no stderr/stdout (got: ${JSON.stringify(remainder)})`,
      );
    },
  );

  it(
    "missing STDIN envelope fields — exits 0",
    { timeout: 5_000 },
    () => {
      const env = {
        ...process.env,
        VIGIL_API_KEY: "vk_test_0000000000000000000000000000000000000000000000000000000000000000",
        VIGIL_API_URL: "http://127.0.0.1:1",
      };
      const result = execSync(
        `printf '{}' | bash '${HOOK_PATH}' --event=SessionStart 2>&1; echo "exit=$?"`,
        { env, shell: "/bin/bash", encoding: "utf8" },
      );
      assert.match(result, /exit=0/, "hook must exit 0 on empty envelope ({})");
      const remainder = result.replace(/exit=0\n?$/, "").trim();
      assert.equal(
        remainder,
        "",
        `empty envelope must produce no stderr/stdout (got: ${JSON.stringify(remainder)})`,
      );
    },
  );

  it("hook source contains zero unconditional echo/printf to terminal (T-134-A1)", () => {
    // Source-grep AGENT-LINUX-04 / T-134-A1 gate. Scan line-by-line; any
    // `echo` or `printf` invocation that is NOT one of the following is a fail:
    //   1. inside `if [ "${VIGIL_AGENT_BRIDGE_DEBUG:-0}" = "1" ]` block
    //      (sanctioned debug-log path per D-T2 → /tmp/vigil-agent-bridge.log)
    //   2. inside `if [ "${VIGIL_AGENT_BRIDGE_EMIT_ONLY:-0}" = "1" ]` block
    //      (sanctioned test-capture path — only fires when tests set the var;
    //       in production the hook never enters this branch and curl runs
    //       normally). This path IS terminal-bound but is exempted because
    //       it is test-only behavior gated by an opt-in env var.
    //   3. feeding into a `node -e` pipeline (echo/printf "$INPUT" | node -e …)
    //   4. inside a comment line
    //   5. inside a redirected target (>> /tmp/...) — the redirect makes the
    //      `printf` write to file, not terminal. Detect via `>>` in same line.
    // Implementation: track whether we are inside a guard block via depth
    // counting on the two opt-in env vars (DEBUG, EMIT_ONLY). Lines piping
    // into node, redirecting to file, or feeding node -e are skipped.
    const src = readFileSync(HOOK_PATH, "utf8");
    const lines = src.split("\n");
    let inGuard = 0; // depth counter — increment on opt-in env var conditional, decrement on matching fi
    const violations: Array<{ lineNumber: number; line: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] as string;
      const trimmed = raw.trim();
      // Skip pure comment lines
      if (trimmed.startsWith("#")) continue;
      // Open guard: line starts a conditional gated on either opt-in env var
      if (/\bif\b.*VIGIL_AGENT_BRIDGE_(DEBUG|EMIT_ONLY)\b/.test(trimmed)) {
        inGuard++;
        continue;
      }
      // Close guard: a bare `fi` decrements depth
      if (inGuard > 0 && /^fi(\s|$|;)/.test(trimmed)) {
        inGuard--;
        continue;
      }
      // Skip lines that pipe INTO node — sanctioned STDIN-JSON parse idiom
      if (/\|\s*node\s+-e/.test(trimmed)) continue;
      // Skip lines that redirect output to a file (>> or > /path)
      if (/>>?\s*\/\S+/.test(trimmed)) continue;
      // The actual check: bare echo/printf at start of statement
      const echoOrPrintf = /^\s*(echo|printf)\b/;
      if (echoOrPrintf.test(raw) && inGuard === 0) {
        violations.push({ lineNumber: i + 1, line: raw });
      }
    }
    assert.equal(
      violations.length,
      0,
      `hook source MUST NOT contain unconditional echo/printf to terminal — T-134-A1 violations:\n${violations
        .map((v) => `  L${v.lineNumber}: ${v.line}`)
        .join("\n")}`,
    );
  });
});
