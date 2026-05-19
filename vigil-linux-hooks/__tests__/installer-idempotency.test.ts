// Phase 134 Plan 04 Task 1 — installer idempotency integration test (Wave-0 RED stub).
//
// Mirrors:
//   - vigil-core/src/services/brief-assembly-service.test.ts:1-99 (mkdtempSync + lifecycle)
//   - vigil-core/src/__tests__/migration-drift.test.ts:37-75 (execSync + env override)
//
// Strategy:
//   1. before(): mkdtemp a fake $HOME, copy fixtures/settings.json into it.
//   2. Run `node install.js` with env.HOME=fakeHome (installer's os.homedir()
//      reads $HOME first on POSIX — verified via Node docs).
//   3. Assert post-install settings.json shape: SessionStart length 3, GSD
//      entries byte-for-byte preserved, spliced entry async:true/timeout:5.
//   4. Re-run install — assert idempotent (length still 3).
//   5. Run --uninstall — assert round-trip to seed state.
//
// Threat mitigations covered by this test file:
//   - T-134-I1 (atomic write / no clobber): post-install file is valid JSON.
//   - T-134-I2 (uninstall preserves GSD): byte-for-byte equality of
//     PostToolUse + PreToolUse against the original fixture.
//   - T-134-A2 (Claude Code v2.1.87 stdio stall): async:true + timeout:5
//     assertion on every spliced entry.
//
// Wave-0 RED state: install.js does NOT YET EXIST — all 6 it-blocks
// fail until Task 2 lands the installer. This is the planned stub-first
// sequence per the Plan 04 task ordering (see plan frontmatter).

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const HOOKS_ROOT = join(here, "..");
const FIXTURE_PATH = join(here, "fixtures", "settings.json");
const INSTALLER = join(HOOKS_ROOT, "install.js");

describe("AGENT-LINUX-05 — installer idempotency", () => {
  let fakeHome: string;
  let settingsPath: string;
  let hookDir: string;
  let originalFixture: string;

  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "vigil-install-"));
    mkdirSync(join(fakeHome, ".claude"), { recursive: true });
    settingsPath = join(fakeHome, ".claude", "settings.json");
    hookDir = join(fakeHome, ".claude", "hooks");
    copyFileSync(FIXTURE_PATH, settingsPath);
    originalFixture = readFileSync(FIXTURE_PATH, "utf8");
  });

  after(() => {
    try {
      rmSync(fakeHome, { recursive: true, force: true });
    } catch {
      /* tempdir cleanup best-effort */
    }
  });

  it("after install: 3 SessionStart entries + originals preserved byte-for-byte (T-134-I2 preservation)", () => {
    execSync(`node ${INSTALLER}`, {
      env: { ...process.env, HOME: fakeHome },
      stdio: "pipe",
    });
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(
      after.hooks.SessionStart.length,
      3,
      "expected 3 SessionStart entries (2 GSD + 1 vigil)"
    );
    assert.equal(
      after.hooks.SessionStart[0].hooks[0].command,
      "node gsd-check-update.js",
      "GSD entry 0 must be preserved byte-for-byte (T-134-I2)"
    );
    assert.equal(
      after.hooks.SessionStart[1].hooks[0].command,
      "bash gsd-session-state.sh",
      "GSD entry 1 must be preserved byte-for-byte (T-134-I2)"
    );
    assert.match(
      after.hooks.SessionStart[2].hooks[0].command,
      /vigil-agent-bridge\.sh --event=SessionStart/,
      "spliced entry must invoke vigil-agent-bridge.sh with --event=SessionStart"
    );
  });

  it("after install: spliced entries have async:true and timeout:5 (T-134-A2 stdio-stall mitigation)", () => {
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    for (const event of ["SessionStart", "UserPromptSubmit", "Stop"]) {
      const arr = after.hooks[event];
      const ours = arr.find((g: { hooks: Array<{ command: string }> }) =>
        g.hooks.some((h) => /vigil-agent-bridge\.sh/.test(h.command))
      );
      assert.ok(ours, `${event} array must contain a vigil-agent-bridge entry`);
      const hook = ours.hooks.find((h: { command: string }) =>
        /vigil-agent-bridge\.sh/.test(h.command)
      );
      assert.equal(
        hook.async,
        true,
        `${event}: spliced entry must have async:true per RESEARCH Pitfall 1`
      );
      assert.equal(
        hook.timeout,
        5,
        `${event}: spliced entry must have timeout:5`
      );
    }
  });

  it("after install: UserPromptSubmit and Stop arrays are CREATED (were absent in fixture)", () => {
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(
      after.hooks.UserPromptSubmit.length,
      1,
      "installer must CREATE UserPromptSubmit array (absent in seed)"
    );
    assert.equal(
      after.hooks.Stop.length,
      1,
      "installer must CREATE Stop array (absent in seed)"
    );
    assert.match(
      after.hooks.UserPromptSubmit[0].hooks[0].command,
      /--event=UserPromptSubmit/
    );
    assert.match(after.hooks.Stop[0].hooks[0].command, /--event=Stop/);
  });

  it("after install: runtime files copied to ~/.claude/hooks/ with executable perms", () => {
    const bridgePath = join(hookDir, "vigil-agent-bridge.sh");
    const redactPath = join(hookDir, "redact.sh");
    const patternsPath = join(hookDir, "redaction-patterns.json");
    assert.ok(existsSync(bridgePath), "vigil-agent-bridge.sh must be copied");
    assert.ok(existsSync(redactPath), "redact.sh must be copied");
    assert.ok(
      existsSync(patternsPath),
      "redaction-patterns.json must be copied"
    );
    assert.ok(
      (statSync(bridgePath).mode & 0o111) !== 0,
      "vigil-agent-bridge.sh must have executable bit set"
    );
    assert.ok(
      (statSync(redactPath).mode & 0o111) !== 0,
      "redact.sh must have executable bit set"
    );
  });

  it("re-run install: no 4th entry added (idempotent)", () => {
    execSync(`node ${INSTALLER}`, {
      env: { ...process.env, HOME: fakeHome },
      stdio: "pipe",
    });
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(
      after.hooks.SessionStart.length,
      3,
      "re-running install must NOT add a 4th SessionStart entry (idempotent)"
    );
    assert.equal(
      after.hooks.UserPromptSubmit.length,
      1,
      "UserPromptSubmit count must remain 1 on re-run"
    );
    assert.equal(
      after.hooks.Stop.length,
      1,
      "Stop count must remain 1 on re-run"
    );
  });

  it("uninstall: returns to 2-entry seed state + runtime files removed (T-134-I2 byte-for-byte round-trip)", () => {
    execSync(`node ${INSTALLER} --uninstall`, {
      env: { ...process.env, HOME: fakeHome },
      stdio: "pipe",
    });
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    const fixture = JSON.parse(originalFixture);
    assert.equal(
      after.hooks.SessionStart.length,
      2,
      "uninstall must restore SessionStart to 2 entries"
    );
    assert.equal(
      after.hooks.SessionStart[0].hooks[0].command,
      "node gsd-check-update.js",
      "uninstall must preserve GSD entry 0 byte-for-byte (T-134-I2)"
    );
    assert.equal(
      after.hooks.SessionStart[1].hooks[0].command,
      "bash gsd-session-state.sh",
      "uninstall must preserve GSD entry 1 byte-for-byte (T-134-I2)"
    );
    // PostToolUse and PreToolUse must be byte-for-byte equal to fixture
    assert.equal(
      JSON.stringify(after.hooks.PostToolUse),
      JSON.stringify(fixture.hooks.PostToolUse),
      "PostToolUse must be byte-for-byte equal to fixture after uninstall"
    );
    assert.equal(
      JSON.stringify(after.hooks.PreToolUse),
      JSON.stringify(fixture.hooks.PreToolUse),
      "PreToolUse must be byte-for-byte equal to fixture after uninstall"
    );
    // UserPromptSubmit + Stop keys must still exist but be empty arrays
    assert.ok(
      Array.isArray(after.hooks.UserPromptSubmit),
      "UserPromptSubmit key must still exist after uninstall (CONTEXT D-N2)"
    );
    assert.equal(
      after.hooks.UserPromptSubmit.length,
      0,
      "UserPromptSubmit must be empty after uninstall"
    );
    assert.ok(
      Array.isArray(after.hooks.Stop),
      "Stop key must still exist after uninstall (CONTEXT D-N2)"
    );
    assert.equal(
      after.hooks.Stop.length,
      0,
      "Stop must be empty after uninstall"
    );
    // Runtime files must be removed
    assert.equal(
      existsSync(join(hookDir, "vigil-agent-bridge.sh")),
      false,
      "vigil-agent-bridge.sh must be removed on uninstall"
    );
    assert.equal(
      existsSync(join(hookDir, "redact.sh")),
      false,
      "redact.sh must be removed on uninstall"
    );
    assert.equal(
      existsSync(join(hookDir, "redaction-patterns.json")),
      false,
      "redaction-patterns.json must be removed on uninstall"
    );
  });

  it("uninstall: anchored COMMAND_REGEX preserves decoy substring matches (CR-02 / T-134-I2)", () => {
    // CR-02 regression guard: a hypothetical third-party hook whose command
    // CONTAINS the substring `vigil-agent-bridge.sh` and `--event=` (e.g.
    // a wrapper or watchdog) MUST survive uninstall. The previously
    // unanchored regex would have deleted it; the anchored regex pins to
    // line-start + literal `bash` + path ending in `/vigil-agent-bridge.sh`
    // + allowlisted event name + line-end, so the decoy below cannot match.
    //
    // Runs after the prior uninstall test, so the fixture is in the
    // 2-entry seed state. Splice a decoy in, re-install (adds vigil on top
    // of decoy), then uninstall and assert the decoy SURVIVES.
    const before = JSON.parse(readFileSync(settingsPath, "utf8"));
    const decoyCommand =
      "bash gsd-vigil-agent-bridge.sh-wrapper --event=foo --extra=bar";
    before.hooks.SessionStart.push({
      hooks: [{ type: "command", command: decoyCommand }],
    });
    writeFileSync(settingsPath, JSON.stringify(before, null, 2));

    execSync(`node ${INSTALLER}`, {
      env: { ...process.env, HOME: fakeHome },
      stdio: "pipe",
    });
    execSync(`node ${INSTALLER} --uninstall`, {
      env: { ...process.env, HOME: fakeHome },
      stdio: "pipe",
    });
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    const stillHasDecoy = after.hooks.SessionStart.some(
      (g: { hooks: Array<{ command: string }> }) =>
        g.hooks.some((h) => h.command === decoyCommand),
    );
    assert.ok(
      stillHasDecoy,
      "decoy hook command containing 'vigil-agent-bridge.sh' substring must SURVIVE uninstall — anchored COMMAND_REGEX must not match it",
    );
    const hasVigil = after.hooks.SessionStart.some(
      (g: { hooks: Array<{ command: string }> }) =>
        g.hooks.some((h) =>
          /\/vigil-agent-bridge\.sh\s+--event=/.test(h.command),
        ),
    );
    assert.equal(
      hasVigil,
      false,
      "vigil entries must still be removed by uninstall (sanity check the anchor still drops real entries)",
    );
  });
});
