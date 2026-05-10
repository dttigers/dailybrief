// Phase 124 Plan 06 — sse-client unit tests.
// Mocks fetch + storage + sleep for deterministic behavior; covers the
// 13 behaviors enumerated in RESEARCH §"Validation Architecture" rows
// for SSE shim + RESEARCH §"Pitfall 2/3/4/7" defenses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSseClient, parseFrame, BACKOFF_MS } from "../sse-client.ts";

// ── parseFrame ───────────────────────────────────────────────────────

test("parseFrame: single-line data", () => {
  const f = parseFrame("event: agent-event\ndata: hello\nid: 1");
  assert.equal(f.event, "agent-event");
  assert.equal(f.data, "hello");
  assert.equal(f.id, "1");
});

test("parseFrame: multi-line data joined with \\n", () => {
  const f = parseFrame("event: agent-event\ndata: line1\ndata: line2\nid: 2");
  assert.equal(f.data, "line1\nline2");
});

test("parseFrame: comment lines (':' prefix) skipped", () => {
  const f = parseFrame(":keepalive\nevent: agent-event\ndata: ok\nid: 3");
  assert.equal(f.event, "agent-event");
  assert.equal(f.data, "ok");
});

test("parseFrame: event: ping recognized so loop can drop it", () => {
  const f = parseFrame("event: ping\ndata: ");
  assert.equal(f.event, "ping");
});

test("parseFrame: missing id returns null", () => {
  const f = parseFrame("event: agent-event\ndata: x");
  assert.equal(f.id, null);
});

// ── BACKOFF_MS schedule lock ─────────────────────────────────────────

test("BACKOFF_MS schedule is exactly [1000, 2000, 4000, 8000, 16000, 30000] (D-11)", () => {
  assert.deepEqual([...BACKOFF_MS], [1000, 2000, 4000, 8000, 16000, 30000]);
});

// ── Helpers ──────────────────────────────────────────────────────────

function fakeStorage(): Pick<Storage, "getItem" | "setItem"> & {
  _store: Map<string, string>;
  _throwOnSet: boolean;
} {
  const _store = new Map<string, string>();
  return {
    _store,
    _throwOnSet: false,
    getItem(k: string) {
      return _store.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if ((this as { _throwOnSet: boolean })._throwOnSet) {
        throw new Error("QuotaExceededError");
      }
      _store.set(k, v);
    },
  } as Pick<Storage, "getItem" | "setItem"> & {
    _store: Map<string, string>;
    _throwOnSet: boolean;
  };
}

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i < chunks.length) {
        ctrl.enqueue(encoder.encode(chunks[i++]));
      } else {
        ctrl.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Returns a Response whose body never resolves and never closes — the reader
 * sits in `read()` forever. The provided abort signal is wired to error the
 * stream, so the shim's AbortController-on-disconnect causes reader.read()
 * to reject and the loop to exit cleanly. Used by tests that need a
 * "subsequent reconnect that doesn't replay the previous chunks" stream
 * without deadlocking the test runner at process exit.
 */
function makeNeverResolvingResponse(signal: AbortSignal | null | undefined): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      if (signal) {
        const onAbort = () => {
          try {
            ctrl.error(new DOMException("aborted", "AbortError"));
          } catch {
            /* already errored */
          }
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }
    },
    pull() {
      /* never enqueue, never close — reader.read() awaits forever (or aborts) */
    },
  });
  return new Response(stream, { status: 200 });
}

// ── Bearer hygiene ───────────────────────────────────────────────────

test("bearer in Authorization header, NEVER in URL", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  const fetchFn: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    // Empty stream that closes immediately so the loop exits the inner read
    return makeStreamResponse([]);
  };
  const sleepFn = (_ms: number) => new Promise<void>(() => {}); // never resolves
  const storage = fakeStorage();
  const client = createSseClient({
    url: "http://localhost:3001/v1/agent-stream",
    apiKey: "vk_TESTKEY_1234",
    onEvent: () => {},
    storage,
    fetchFn,
    sleepFn,
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 20));
  client.disconnect();
  assert.ok(
    !capturedUrl.includes("vk_TESTKEY_1234"),
    `bearer must NOT appear in URL: got ${capturedUrl}`,
  );
  assert.ok(!capturedUrl.includes("?token="), "no ?token= querystring");
  assert.ok(!capturedUrl.includes("?api_key="), "no ?api_key= querystring");
  assert.equal(capturedHeaders["Authorization"], "Bearer vk_TESTKEY_1234");
  assert.equal(capturedHeaders["Accept"], "text/event-stream");
});

// ── Last-Event-ID persistence ────────────────────────────────────────

test("after a successful agent-event frame, lastEventId persists to storage", async () => {
  const storage = fakeStorage();
  let calls = 0;
  const fetchFn: typeof fetch = async (_url, init) => {
    calls++;
    if (calls === 1) {
      return makeStreamResponse(['event: agent-event\nid: 42\ndata: {"x":1}\n\n']);
    }
    return makeNeverResolvingResponse(init?.signal ?? null);
  };
  const events: Array<{ id: string; data: string }> = [];
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: (id, data) => events.push({ id, data }),
    storage,
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 50));
  client.disconnect();
  // Drain microtasks + the trailing setTimeout(0) sleep so the loop fully
  // exits before the test resolves; otherwise the next test in the file
  // runs while this client's loop still has pending timers, which can
  // serialize incorrectly under node:test's runner.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(storage.getItem("vigil:lastEventId"), "42");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.id, "42");
});

test("on reconnect, Last-Event-ID header is sent from storage", async () => {
  const storage = fakeStorage();
  storage.setItem("vigil:lastEventId", "99");
  let capturedHeaders: Record<string, string> = {};
  const fetchFn: typeof fetch = async (_url, init) => {
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    return makeStreamResponse([]);
  };
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: () => {},
    storage,
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 20));
  client.disconnect();
  assert.equal(capturedHeaders["Last-Event-ID"], "99");
});

test("storage.setItem QuotaExceededError does not crash the loop", async () => {
  const storage = fakeStorage();
  storage._throwOnSet = true;
  let calls = 0;
  const fetchFn: typeof fetch = async (_url, init) => {
    calls++;
    if (calls === 1) {
      return makeStreamResponse(["event: agent-event\nid: 1\ndata: ok\n\n"]);
    }
    return makeNeverResolvingResponse(init?.signal ?? null);
  };
  let received = false;
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: () => {
      received = true;
    },
    storage,
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 50));
  client.disconnect();
  // Drain microtasks + the trailing setTimeout(0) sleep so the loop fully
  // exits before the test resolves; otherwise the next test in the file
  // runs while this client's loop still has pending timers, which can
  // serialize incorrectly under node:test's runner.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    received,
    true,
    "onEvent fired despite QuotaExceededError on setItem",
  );
});

// ── State callbacks + ping silent drop ───────────────────────────────

test("onStateChange(true) on first 200 OK; ping frames dropped silently", async () => {
  let calls = 0;
  const fetchFn: typeof fetch = async (_url, init) => {
    calls++;
    if (calls === 1) {
      return makeStreamResponse([
        "event: ping\ndata: \n\n",
        "event: agent-event\nid: 5\ndata: yes\n\n",
      ]);
    }
    return makeNeverResolvingResponse(init?.signal ?? null);
  };
  const states: boolean[] = [];
  const events: string[] = [];
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: (id, _data) => events.push(id),
    onStateChange: (c) => states.push(c),
    storage: fakeStorage(),
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 50));
  client.disconnect();
  // Drain microtasks + the trailing setTimeout(0) sleep so the loop fully
  // exits before the test resolves; otherwise the next test in the file
  // runs while this client's loop still has pending timers, which can
  // serialize incorrectly under node:test's runner.
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(states.includes(true), "onStateChange(true) fired");
  assert.deepEqual(events, ["5"], "ping was dropped; only agent-event surfaced");
});

// ── Backoff timing ───────────────────────────────────────────────────

test("disconnect → backoff schedule increments through array, capped at 30000", async () => {
  const sleeps: number[] = [];
  const fetchFn: typeof fetch = async () => {
    // Always fail with an error so the loop iterates through backoff.
    throw new Error("simulated network error");
  };
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: () => {},
    storage: fakeStorage(),
    fetchFn,
    // Yield via setTimeout(0) on every call — prevents microtask starvation
    // (the test's polling loop below uses setTimeout(5) and would otherwise
    // never get a turn against an instant-resolving sleepFn).
    sleepFn: (ms) =>
      new Promise<void>((r) => {
        sleeps.push(ms);
        setTimeout(r, 0);
      }),
  });
  client.connect();
  // Allow many iterations — we record sleeps until 7+ entries
  const deadline = Date.now() + 500;
  while (sleeps.length < 7 && Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  client.disconnect();
  // Drain the trailing setTimeout(0) so node:test doesn't wait on it.
  await new Promise<void>((r) => setTimeout(r, 10));
  assert.ok(sleeps.length >= 6, `recorded ${sleeps.length} sleep durations`);
  assert.equal(sleeps[0], 1000);
  assert.equal(sleeps[1], 2000);
  assert.equal(sleeps[2], 4000);
  assert.equal(sleeps[3], 8000);
  assert.equal(sleeps[4], 16000);
  assert.equal(sleeps[5], 30000);
  // Capped: any further entries are also 30000
  for (let i = 6; i < sleeps.length; i++) {
    assert.equal(sleeps[i], 30000, `sleep[${i}] capped at 30000`);
  }
});

test("successful connect resets backoffIndex (next disconnect waits 1000 again)", async () => {
  const sleeps: number[] = [];
  let succeed = false;
  const fetchFn: typeof fetch = async () => {
    if (succeed) {
      succeed = false; // Only first connect after flip succeeds; next iteration fails
      return makeStreamResponse([]); // EOF immediately → triggers reconnect
    }
    throw new Error("fail");
  };
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: () => {},
    storage: fakeStorage(),
    fetchFn,
    sleepFn: (ms) =>
      new Promise<void>((r) => {
        sleeps.push(ms);
        // After two failures, allow the next attempt to succeed
        if (sleeps.length === 2) succeed = true;
        setTimeout(r, 0);
      }),
  });
  client.connect();
  const deadline = Date.now() + 500;
  while (sleeps.length < 4 && Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  client.disconnect();
  await new Promise<void>((r) => setTimeout(r, 10));
  // sleeps[0] = 1000 (first failure)
  // sleeps[1] = 2000 (second failure)
  // ... then a success resets backoffIndex
  // sleeps[2] should be 1000 again (after success+EOF reset)
  assert.equal(sleeps[0], 1000);
  assert.equal(sleeps[1], 2000);
  assert.equal(sleeps[2], 1000, "successful connect reset backoffIndex");
});

// ── Phase 125 Wave 0 (AGENT-HUD-03 / D-02) ──────────────────────────
// quiet_mode_changed event-type dispatch in the SSE shim. Plan 06 GREEN —
// `else if (parsed.event === 'quiet_mode_changed')` branch + `onQuietMode?:
// (data: string) => void` on SseClientOptions (per RESEARCH §Pattern 4
// lines 446-479).
// (`test` and `assert` already imported above — no re-import needed.)

test("parsed.event === 'quiet_mode_changed' invokes opts.onQuietMode with parsed.data string", async () => {
  // Plan 125-06 Task 1 behavior 1 (DISPATCH): a scripted SSE frame with
  // event=quiet_mode_changed must invoke opts.onQuietMode exactly once
  // with the raw `data` string (not parsed JSON).
  const dataPayload = '{"enabled":true,"since":"2026-05-10T12:00:00Z"}';
  let calls = 0;
  const captured: string[] = [];
  let fetchCalls = 0;
  const fetchFn: typeof fetch = async (_url, init) => {
    fetchCalls++;
    if (fetchCalls === 1) {
      return makeStreamResponse([
        `event: quiet_mode_changed\ndata: ${dataPayload}\n\n`,
      ]);
    }
    return makeNeverResolvingResponse(init?.signal ?? null);
  };
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: () => {},
    onQuietMode: (data) => {
      calls++;
      captured.push(data);
    },
    storage: fakeStorage(),
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 50));
  client.disconnect();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 1, "onQuietMode invoked exactly once");
  assert.equal(captured[0], dataPayload, "raw JSON-string data forwarded verbatim");
});

test("opts.onQuietMode is optional — missing callback does not throw on quiet_mode_changed frame", async () => {
  // Plan 125-06 Task 1 behavior 2 (OPTIONAL): a client constructed without
  // onQuietMode must NOT throw when a quiet_mode_changed frame arrives,
  // and the loop must continue processing subsequent agent-event frames.
  let fetchCalls = 0;
  const fetchFn: typeof fetch = async (_url, init) => {
    fetchCalls++;
    if (fetchCalls === 1) {
      return makeStreamResponse([
        'event: quiet_mode_changed\ndata: {"enabled":true,"since":null}\n\n',
        'event: agent-event\nid: 7\ndata: post-quiet\n\n',
      ]);
    }
    return makeNeverResolvingResponse(init?.signal ?? null);
  };
  const events: Array<{ id: string; data: string }> = [];
  // Deliberately omit onQuietMode from the opts object.
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: (id, data) => events.push({ id, data }),
    storage: fakeStorage(),
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 50));
  client.disconnect();
  await new Promise((r) => setTimeout(r, 10));
  // No throw means the test reaches here; assert the trailing agent-event
  // was still delivered (loop didn't crash on the prior quiet_mode_changed).
  assert.equal(events.length, 1, "agent-event after quiet_mode_changed still delivered");
  assert.equal(events[0]!.id, "7");
  assert.equal(events[0]!.data, "post-quiet");
});

test("agent-event dispatch path UNCHANGED — quiet_mode_changed branch does not steal agent-event frames", async () => {
  // Plan 125-06 Task 1 behavior 3 (NO-STEAL): interleaved agent-event and
  // quiet_mode_changed frames must each fire their respective callback
  // exactly once — neither path starves the other.
  let fetchCalls = 0;
  const fetchFn: typeof fetch = async (_url, init) => {
    fetchCalls++;
    if (fetchCalls === 1) {
      return makeStreamResponse([
        'event: agent-event\nid: 1\ndata: hb-a\n\n',
        'event: quiet_mode_changed\ndata: {"enabled":true,"since":"t1"}\n\n',
        'event: agent-event\nid: 2\ndata: hb-b\n\n',
        'event: quiet_mode_changed\ndata: {"enabled":false,"since":null}\n\n',
      ]);
    }
    return makeNeverResolvingResponse(init?.signal ?? null);
  };
  const events: Array<{ id: string; data: string }> = [];
  const quiet: string[] = [];
  const client = createSseClient({
    url: "http://x/v1/agent-stream",
    apiKey: "vk_X",
    onEvent: (id, data) => events.push({ id, data }),
    onQuietMode: (data) => quiet.push(data),
    storage: fakeStorage(),
    fetchFn,
    sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
  });
  client.connect();
  await new Promise((r) => setTimeout(r, 60));
  client.disconnect();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(events.length, 2, "both agent-event frames dispatched");
  assert.equal(events[0]!.id, "1");
  assert.equal(events[1]!.id, "2");
  assert.equal(quiet.length, 2, "both quiet_mode_changed frames dispatched");
  assert.equal(quiet[0], '{"enabled":true,"since":"t1"}');
  assert.equal(quiet[1], '{"enabled":false,"since":null}');
});
