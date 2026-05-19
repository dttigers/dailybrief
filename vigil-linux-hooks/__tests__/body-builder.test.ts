// Phase 134 Plan 01 Task 1 — Wave 0 body-builder tests.
//
// Mirror of: vigil-core/src/__tests__/audio-log-redaction.test.ts:63-75 (node:test
// imports + before() ROOT computation).
//
// These three tests verify the emit_event helper in vigil-agent-bridge.sh
// produces a Phase 121 KNOWN_FIELDS-compliant JSON body. The capture path is
// VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 — when set, emit_event prints the JSON body
// to stdout and returns 0 before invoking curl. This contract is load-bearing
// for Plans 02-04 which extend per-event handlers on the same body-builder.
//
// Wave-0 state: all three tests are expected to FAIL until Task 2 lands the
// hook script. Task 2 then turns them GREEN.
//
// Run: cd vigil-linux-hooks && npx tsx --test __tests__/body-builder.test.ts

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
let HOOK_PATH = "";

before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // __tests__/body-builder.test.ts → vigil-linux-hooks/ is one level up
  ROOT = path.join(here, "..");
  HOOK_PATH = path.join(ROOT, "vigil-agent-bridge.sh");
});

// Phase 121 KNOWN_FIELDS — load-bearing source-of-truth from
// vigil-core/src/routes/agent-events.ts:34-43. Any key outside this 8-key
// Set returns HTTP 400 unknown_field at the server. Phase 134 sends exactly
// 7 of these (never exit_code — that field is only meaningful for task_failed).
const KNOWN_FIELDS = new Set([
  "session_id",
  "event",
  "message",
  "timestamp",
  "label",
  "host",
  "exit_code",
  "client_event_id",
]);

/** Spawn the hook with VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 and capture the JSON
 * body the body-builder would have POST'd. The shell-level pipeline:
 *   1. printf STDIN_JSON | bash hook --event=EVENT_TYPE
 *   2. emit_event sees EMIT_ONLY=1 and prints body to stdout, returns 0
 *   3. We parse the captured stdout as JSON.
 */
function captureBody(
  eventType: "SessionStart" | "UserPromptSubmit" | "Stop",
  envOverrides: Record<string, string> = {},
): { body: any; stdout: string; stderr: string } {
  const fixturePath = path.join(ROOT, "__tests__", "fixtures", "probe-envelope.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const stdinJson = JSON.stringify(fixture[eventType]);

  const env = {
    ...process.env,
    VIGIL_API_KEY: "vk_test_0000000000000000000000000000000000000000000000000000000000000000",
    VIGIL_AGENT_BRIDGE_EMIT_ONLY: "1",
    // Keep network destination unreachable just in case EMIT_ONLY misbehaves.
    VIGIL_API_URL: "http://127.0.0.1:1",
    ...envOverrides,
  };

  // Pipe STDIN JSON to the hook. Capture both stdout (body emit) and stderr
  // (must be empty per AGENT-LINUX-04). 2>&1 + tagged "STDERR:" sentinel
  // would conflate streams; instead we collect them separately via shell.
  // Use a tmpfile for stderr capture to keep the assertion simple.
  const cmd = `printf '%s' '${stdinJson.replace(/'/g, "'\\''")}' | bash '${HOOK_PATH}' --event=${eventType} 2>/tmp/vigil-bb-test-stderr`;
  let stdout = "";
  try {
    stdout = execSync(cmd, { env, shell: "/bin/bash", encoding: "utf8" });
  } catch (err: any) {
    // If the hook process itself errored (which it should NOT per fail-safe
    // contract), surface a clean message so the test diagnostic is useful.
    throw new Error(
      `hook spawn failed (exit=${err.status}): stdout=${err.stdout} stderr=${err.stderr}`,
    );
  }
  const stderr = (() => {
    try {
      return readFileSync("/tmp/vigil-bb-test-stderr", "utf8");
    } catch {
      return "";
    }
  })();

  let body: any = null;
  try {
    body = JSON.parse(stdout.trim());
  } catch {
    // Leave body=null so the per-test assertion fails with a clear message.
  }
  return { body, stdout, stderr };
}

describe("AGENT-LINUX-01/02 — emit_event body builder shape", () => {
  it("allowed keys only — body has zero keys outside the 8-key KNOWN_FIELDS", () => {
    const { body, stdout } = captureBody("SessionStart");
    assert.ok(
      body && typeof body === "object",
      `body must be a JSON object — got stdout=${JSON.stringify(stdout)}`,
    );
    for (const k of Object.keys(body)) {
      assert.ok(
        KNOWN_FIELDS.has(k),
        `unknown field "${k}" would 400-reject server-side (KNOWN_FIELDS Set in agent-events.ts:34-43)`,
      );
    }
  });

  it("SessionStart heartbeat — required 6 fields present + shapes match Phase 121 validator", () => {
    const { body } = captureBody("SessionStart");
    assert.ok(body && typeof body === "object", "body must be a JSON object");
    // event must equal "heartbeat" per CONTEXT D-P1 — Phase 134 only emits
    // "heartbeat" + "task_complete"; SessionStart is heartbeat.
    assert.equal(body.event, "heartbeat", "SessionStart event must be heartbeat");
    assert.equal(typeof body.session_id, "string");
    assert.ok((body.session_id as string).length > 0, "session_id must be non-empty");
    assert.match(
      body.timestamp,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      "timestamp must be ISO-8601 (date -Iseconds output)",
    );
    // label = basename(cwd) per D-P4. Fixture cwd is /home/morrillboss/dev/dailybrief.
    assert.equal(body.label, "dailybrief", "label must be basename(cwd)");
    assert.equal(typeof body.host, "string");
    assert.ok((body.host as string).length > 0, "host must be non-empty");
    // client_event_id = uuidgen output → standard 36-char hyphenated UUID v4
    assert.match(
      body.client_event_id,
      /^[0-9a-f-]{36}$/,
      "client_event_id must be lowercase-hex UUID v4 shape",
    );
  });

  it("emit_event without VIGIL_API_KEY skips curl AND returns no body (early-exit gate)", () => {
    // D-A1 says: when VIGIL_API_KEY is unset/empty, the hook exits 0 silently
    // BEFORE reaching emit_event — therefore stdout MUST be empty. We do not
    // expect a body in this path. We also confirm stderr is empty.
    const { stdout, stderr } = captureBody("SessionStart", { VIGIL_API_KEY: "" });
    assert.equal(stdout, "", "no API key → hook exits 0 with no stdout");
    assert.equal(stderr, "", "no API key → hook exits 0 with no stderr (D-A4)");
  });
});
