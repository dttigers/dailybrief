---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 06
type: execute
wave: 2
depends_on: [01, 03]
files_modified:
  - vigil-g2-plugin/src/lib/sse-client.ts
  - vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts
  - vigil-g2-plugin/src/types.ts
autonomous: true
requirements: [AGENT-API-03, AGENT-HUD-01]
tags: [phase-124, plugin, sse-shim, transport]

must_haves:
  truths:
    - "SSE shim sets Authorization: Bearer ${VITE_API_KEY} on every fetch — bearer NEVER appears in URL"
    - "SSE shim sends Last-Event-ID header on reconnect when localStorage has 'vigil:lastEventId'"
    - "Frame parser correctly handles multi-line data:, comments (':' prefix), event: ping silent drop, multi-byte UTF-8 across chunk boundaries, and frames split across multiple reader.read() chunks"
    - "On disconnect, exp. backoff schedule is exactly [1000, 2000, 4000, 8000, 16000, 30000] ms (cap at 30s)"
    - "After successful frame, localStorage.setItem('vigil:lastEventId', id) — wrapped in try/catch to survive QuotaExceededError"
    - "No console.log calls reference Authorization, Bearer, vk_, or VITE_API_KEY (per feedback_railway_variables_leak)"
    - "disconnect() aborts the in-flight fetch via AbortController"
  artifacts:
    - path: "vigil-g2-plugin/src/lib/sse-client.ts"
      provides: "Hand-rolled custom EventSource shim — fetch + ReadableStream + TextDecoder + frame parser + exp. backoff + Last-Event-ID persistence (D-04, D-11)"
      exports: ["createSseClient", "BACKOFF_MS"]
      contains: "ReadableStream"
    - path: "vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts"
      provides: "Parser unit tests + backoff timing tests (mocked fetch + timers)"
      contains: "node:test"
    - path: "vigil-g2-plugin/src/types.ts"
      provides: "AgentSessionRow + AgentEvent types consumed by Companion screen + sse-client"
      contains: "AgentSessionRow"
  key_links:
    - from: "vigil-g2-plugin/src/lib/sse-client.ts"
      to: "vigil-core/src/routes/agent-stream.ts"
      via: "GET /v1/agent-stream with Bearer token + optional Last-Event-ID header"
      pattern: "VITE_API_URL"
    - from: "vigil-g2-plugin/src/lib/sse-client.ts"
      to: "WebView localStorage"
      via: "vigil:lastEventId key (string)"
      pattern: "vigil:lastEventId"
---

<objective>
Implement the WKWebView-side SSE consumer per D-04 and D-11. The shim runs in the Even Hub iPhone app's WebView and consumes `GET /v1/agent-stream` (Plan 03) via `fetch()` + `ReadableStream` + `TextDecoder` + manual frame parser. Native `EventSource` is rejected because it cannot set the `Authorization` header (bearer would have to live in the URL → leaks to Railway logs per memory `feedback_railway_variables_leak`).

Locked behaviors (D-04, D-11):
- Authorization in header, never URL.
- Exp. backoff `[1s, 2s, 4s, 8s, 16s, 30s cap]` on disconnect.
- `Last-Event-ID` resume header from `localStorage['vigil:lastEventId']`.
- `event: ping` keepalive frames silently dropped (server emits every 25s per Plan 03).
- AbortController-based disconnect.
- localStorage write try/catch (RESEARCH Pitfall 4).

Purpose:
- AGENT-API-03 — client-side consumer of the SSE fan-out.
- AGENT-HUD-01 — connection-state callback drives the Companion offline indicator (Plan 07).
- Preserve plugin's "zero new runtime npm deps" posture (D-04 + ~60 hand-rolled lines).

Output:
- `vigil-g2-plugin/src/lib/sse-client.ts` (NEW, ~80 lines) — `createSseClient(opts)` factory
- `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts` (NEW) — parser + backoff tests
- `vigil-g2-plugin/src/types.ts` (MODIFIED) — add `AgentSessionRow` and `AgentEvent` types
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-UI-SPEC.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-01-SUMMARY.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-03-SUMMARY.md
@vigil-g2-plugin/src/api.ts
@vigil-g2-plugin/src/types.ts
@vigil-core/src/routes/agent-events.ts

<interfaces>
<!-- LOCKED constants from CONTEXT D-11 + RESEARCH Pattern 3 -->
export const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
const STORAGE_KEY = "vigil:lastEventId" as const;

<!-- Public API of createSseClient (locked from RESEARCH §Pattern 3 + UI-SPEC SSE State Machine) -->
type EventCallback = (id: string, data: string) => void;
type StateCallback = (connected: boolean) => void;

export interface SseClientOptions {
  url: string;            // e.g. `${VITE_API_URL}/agent-stream`
  apiKey: string;         // VITE_API_KEY (vk_...)
  onEvent: EventCallback; // called per parsed agent-event frame
  onStateChange?: StateCallback;
  storage?: Pick<Storage, "getItem" | "setItem">; // injectable for tests
  fetchFn?: typeof fetch;                          // injectable for tests
}

export function createSseClient(opts: SseClientOptions): {
  connect(): void;
  disconnect(): void;
};

<!-- Auth header pattern (mirror api.ts:5-21 — bearer goes in HEADER, never URL) -->
function sseHeaders(apiKey: string, lastEventId: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Accept": "text/event-stream",
  };
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;
  return headers;
}

<!-- AgentSessionRow shape (from vigil-core/src/routes/agent-events.ts:64-74) -->
export interface AgentEvent {
  event: "needs_input" | "task_complete" | "task_failed" | "milestone" | "heartbeat";
  message: string | null;
  eventTimestamp: string;       // ISO-8601
}

export interface AgentSessionRow {
  sessionId: string;
  label: string;
  host: string;
  lastEvent: AgentEvent;
  eventCount: number;
}

<!-- Frame parser (RESEARCH §"Pattern 3" lines 531-543) -->
function parseFrame(frame: string): { event: string; data: string; id: string | null } {
  let event = "message";
  const dataLines: string[] = [];
  let id: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // SSE comment per WHATWG spec
    if (line.startsWith("event:")) event = line.slice(6).trimStart();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    else if (line.startsWith("id:")) id = line.slice(3).trimStart();
  }
  return { event, data: dataLines.join("\n"), id };
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement sse-client.ts shim with frame parser, backoff, Last-Event-ID persistence</name>
  <files>
    vigil-g2-plugin/src/lib/sse-client.ts,
    vigil-g2-plugin/src/types.ts
  </files>
  <read_first>
    - vigil-g2-plugin/src/api.ts (FULL file — auth header pattern at lines 5-21; VITE_API_URL/VITE_API_KEY env plumbing)
    - vigil-g2-plugin/src/types.ts (FULL file — match existing type-export style; add AgentSessionRow + AgentEvent at the end)
    - vigil-core/src/routes/agent-events.ts lines 64-74 (canonical AgentSessionRow shape)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md §"Pattern 3" lines 451-543 (full shim sketch)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md §"sse-client.ts"
  </read_first>
  <behavior>
    - On connect(), opens fetch with Authorization header + Accept: text/event-stream, optional Last-Event-ID from storage.
    - On 200 OK + ReadableStream body: streams chunks via TextDecoder({stream: true}), splits on \n\n, parses frames via parseFrame.
    - For each agent-event frame with id: storage.setItem(STORAGE_KEY, id) wrapped in try/catch; calls onEvent(id, data).
    - For event: ping frames: drops silently.
    - On non-2xx OR fetch reject OR reader EOF: invokes onStateChange(false), waits BACKOFF_MS[idx], reconnects, increments idx (capped).
    - On successful re-establishment: invokes onStateChange(true), resets backoffIndex to 0.
    - disconnect(): sets stopped=true; aborts the in-flight fetch via AbortController; idempotent.
    - NEVER logs Authorization, Bearer, vk_, or VITE_API_KEY values.
  </behavior>
  <action>
    ## Step A: Extend `vigil-g2-plugin/src/types.ts`

    Use Edit tool. Append (do not modify existing types):

    ```typescript
    // Phase 124 (AGENT-API-03 / AGENT-HUD-01): agent_events row shapes
    // mirror vigil-core/src/routes/agent-events.ts:64-74 response shape.
    // The 5 event values are locked per Phase 122 D-01 (drift-detector pinned).
    export type AgentEventType =
      | "needs_input"
      | "task_complete"
      | "task_failed"
      | "milestone"
      | "heartbeat";

    export interface AgentEvent {
      event: AgentEventType;
      message: string | null;
      eventTimestamp: string; // ISO-8601 from vigil-core
    }

    export interface AgentSessionRow {
      sessionId: string;
      label: string;
      host: string;
      lastEvent: AgentEvent;
      eventCount: number;
    }
    ```

    ## Step B: Create `vigil-g2-plugin/src/lib/sse-client.ts`

    Use Write tool. Mirror RESEARCH §"Pattern 3" sketch verbatim where practical. Full content:

    ```typescript
    /**
     * Phase 124 (AGENT-API-03 / D-04 / D-11): WKWebView SSE shim.
     *
     * Hand-rolled EventSource replacement that uses fetch() + ReadableStream +
     * TextDecoder + manual SSE frame parser. Native `EventSource` cannot set
     * the `Authorization` header (only browser-controlled cookies per WHATWG
     * spec); this shim places the bearer in the request header where it
     * belongs.
     *
     * SECURITY (memory: feedback_railway_variables_leak):
     *   - VITE_API_KEY is read from import.meta.env at module-eval time and
     *     passed verbatim into the Authorization header — NEVER into the URL,
     *     NEVER into a console.log, NEVER into an Error message.
     *   - All error paths log shape only ({ status, hasAuth: !!apiKey }) — no
     *     bearer value, no header dump.
     *
     * BEHAVIOR (CONTEXT D-04, D-11):
     *   - Backoff schedule: [1000, 2000, 4000, 8000, 16000, 30000] ms cap.
     *   - On reconnect, sends Last-Event-ID header from
     *     localStorage['vigil:lastEventId'].
     *   - On every successful frame, persists id to localStorage (try/catch
     *     to survive QuotaExceededError per RESEARCH Pitfall 4).
     *   - `event: ping` keepalive frames (server emits every 25s) are silently
     *     dropped.
     *   - disconnect() aborts the in-flight fetch via AbortController.
     */

    export const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
    const STORAGE_KEY = "vigil:lastEventId";

    type EventCallback = (id: string, data: string) => void;
    type StateCallback = (connected: boolean) => void;

    export interface SseClientOptions {
      url: string;
      apiKey: string;
      onEvent: EventCallback;
      onStateChange?: StateCallback;
      // Injection seams for unit tests
      storage?: Pick<Storage, "getItem" | "setItem">;
      fetchFn?: typeof fetch;
      // setTimeout/clearTimeout injection for fake-timer tests
      sleepFn?: (ms: number) => Promise<void>;
    }

    function defaultSleep(ms: number): Promise<void> {
      return new Promise((r) => setTimeout(r, ms));
    }

    function safeWriteStorage(
      storage: Pick<Storage, "getItem" | "setItem">,
      key: string,
      value: string,
    ): void {
      try {
        storage.setItem(key, value);
      } catch {
        // QuotaExceededError or storage disabled — replay still works on next
        // reconnect via the next event we receive (RESEARCH Pitfall 4).
      }
    }

    export function parseFrame(
      frame: string,
    ): { event: string; data: string; id: string | null } {
      let event = "message";
      const dataLines: string[] = [];
      let id: string | null = null;
      for (const line of frame.split("\n")) {
        if (line.startsWith(":")) continue; // SSE comment
        if (line.startsWith("event:")) event = line.slice(6).trimStart();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        else if (line.startsWith("id:")) id = line.slice(3).trimStart();
      }
      return { event, data: dataLines.join("\n"), id };
    }

    export function createSseClient(opts: SseClientOptions) {
      const storage = opts.storage ?? globalThis.localStorage;
      const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
      const sleep = opts.sleepFn ?? defaultSleep;

      let abortController: AbortController | null = null;
      let backoffIndex = 0;
      let stopped = false;
      let loopRunning = false;

      async function loop(): Promise<void> {
        if (loopRunning) return;
        loopRunning = true;
        try {
          while (!stopped) {
            abortController = new AbortController();
            const lastEventId = storage.getItem(STORAGE_KEY);
            const headers: Record<string, string> = {
              "Authorization": `Bearer ${opts.apiKey}`,
              "Accept": "text/event-stream",
            };
            if (lastEventId) headers["Last-Event-ID"] = lastEventId;

            try {
              const res = await fetchFn(opts.url, {
                headers,
                signal: abortController.signal,
              });
              if (!res.ok || !res.body) {
                // Surface only status/shape — never the response body or
                // Authorization header.
                throw new Error(`SSE HTTP ${res.status}`);
              }
              opts.onStateChange?.(true);
              backoffIndex = 0;

              const reader = res.body.getReader();
              const decoder = new TextDecoder("utf-8");
              let buffer = "";
              while (!stopped) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf("\n\n")) >= 0) {
                  const frame = buffer.slice(0, idx);
                  buffer = buffer.slice(idx + 2);
                  const parsed = parseFrame(frame);
                  if (parsed.event === "ping") continue; // server keepalive
                  if (parsed.event === "agent-event" && parsed.id) {
                    safeWriteStorage(storage, STORAGE_KEY, parsed.id);
                    opts.onEvent(parsed.id, parsed.data);
                  }
                }
              }
              // EOF without explicit stop → fall through to reconnect
              if (!stopped) {
                opts.onStateChange?.(false);
              }
            } catch (_err) {
              if (stopped) return;
              opts.onStateChange?.(false);
            }

            if (stopped) return;
            const wait = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
            backoffIndex = Math.min(backoffIndex + 1, BACKOFF_MS.length - 1);
            await sleep(wait);
          }
        } finally {
          loopRunning = false;
        }
      }

      return {
        connect(): void {
          stopped = false;
          backoffIndex = 0;
          void loop();
        },
        disconnect(): void {
          stopped = true;
          abortController?.abort();
        },
      };
    }
    ```

    Verify TypeScript compiles:
    ```
    cd vigil-g2-plugin && npx tsc --noEmit
    ```
  </action>
  <verify>
    <automated>cd vigil-g2-plugin && npx tsc --noEmit 2>&1 | grep -E "src/(lib/sse-client|types)\.ts" | head -10 ; echo "---"</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-g2-plugin/src/lib/sse-client.ts`
    - Contains `BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]` (grep `\[1000, 2000, 4000, 8000, 16000, 30000\]` exits 0 — exact array per D-11)
    - Contains `Authorization` (grep exits 0)
    - Contains `Bearer ${opts.apiKey}` (grep `Bearer \${opts\.apiKey}` exits 0)
    - Contains `Last-Event-ID` (grep exits 0)
    - Contains `vigil:lastEventId` (grep exits 0)
    - Contains `TextDecoder` AND `ReadableStream` references (or `getReader()`) — grep both
    - Contains `event === "ping"` (grep exits 0; silent drop)
    - Contains `AbortController` (grep exits 0)
    - Contains `try/catch` around storage.setItem (grep `safeWriteStorage` exits 0 — function name implies the try/catch)
    - Does NOT contain any `console.log/warn/error/info` referencing Authorization/Bearer/vk_/VITE_API_KEY/apiKey: `grep -E '(console\.(log|warn|error|info)).*(Authorization|Bearer|vk_|VITE_API_KEY|apiKey)' vigil-g2-plugin/src/lib/sse-client.ts` exits non-zero
    - Does NOT contain bearer in URL pattern: `grep -E '(\?token=|\?api_key=|\$\{.*apiKey.*\}.*\?)' vigil-g2-plugin/src/lib/sse-client.ts` exits non-zero
    - `vigil-g2-plugin/src/types.ts` contains `AgentSessionRow` (grep exits 0)
    - `vigil-g2-plugin/src/types.ts` contains `AgentEventType` (grep exits 0)
    - `cd vigil-g2-plugin && npx tsc --noEmit` produces zero errors involving sse-client.ts or types.ts
  </acceptance_criteria>
  <done>
    SSE shim implements connect/disconnect/parseFrame with the exact backoff schedule, bearer-in-header-only, Last-Event-ID persistence, ping silent drop, AbortController disconnect. Bearer never logged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Unit tests for parser correctness, backoff timing, bearer hygiene</name>
  <files>
    vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts
  </files>
  <read_first>
    - vigil-g2-plugin/src/lib/sse-client.ts (Task 1 output — match the public API + parseFrame export)
    - vigil-g2-plugin/src/__tests__/smoke.test.ts (Plan 01 output — match the node:test scaffold)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md §"Validation Architecture" rows for SSE shim parser + backoff
  </read_first>
  <behavior>
    Parser tests:
    - Single-line `data:` parses cleanly.
    - Multi-line `data:` concatenated with `\n`.
    - Comment lines (`:keepalive`) skipped.
    - `event: ping` returns event="ping" so the loop can drop it.
    - Frame split across two reader chunks parses correctly (test by simulating chunked input through the loop, OR via direct parseFrame call on assembled buffer).
    - Multi-byte UTF-8 split across chunks decodes correctly via TextDecoder({stream:true}) — tested through a fake-fetch returning a 2-byte char split across two reader.read() resolves.

    Backoff tests:
    - First disconnect → sleep 1000ms.
    - Second consecutive disconnect → sleep 2000ms.
    - Sixth+ consecutive disconnect → sleep 30000ms (capped).
    - Successful connect resets backoffIndex to 0; next disconnect waits 1000ms again.

    Bearer hygiene tests:
    - Mock fetch records the headers it received; assert `Authorization === "Bearer ${apiKey}"` and `apiKey` is NOT in the URL.

    State callback tests:
    - onStateChange(true) on first 200 OK
    - onStateChange(false) on disconnect
    - On reconnect after success: onStateChange(false) followed by onStateChange(true)

    Last-Event-ID persistence tests:
    - First successful frame writes lastEventId to storage.
    - On reconnect, fetch is called with `Last-Event-ID: <persisted>` header.
    - storage.setItem throws QuotaExceededError → loop continues (no crash).
  </behavior>
  <action>
    Create `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts` (use Write tool):

    ```typescript
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

    function fakeStorage(): Pick<Storage, "getItem" | "setItem"> & { _store: Map<string, string>; _throwOnSet: boolean } {
      const _store = new Map<string, string>();
      return {
        _store,
        _throwOnSet: false,
        getItem(k: string) { return _store.get(k) ?? null; },
        setItem(k: string, v: string) {
          if ((this as any)._throwOnSet) throw new Error("QuotaExceededError");
          _store.set(k, v);
        },
      } as any;
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
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
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
      let resolveSleep: (() => void) | null = null;
      const sleepFn = (_ms: number) => new Promise<void>((r) => { resolveSleep = r; });
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
      await new Promise(r => setTimeout(r, 20));
      client.disconnect();
      assert.ok(!capturedUrl.includes("vk_TESTKEY_1234"), `bearer must NOT appear in URL: got ${capturedUrl}`);
      assert.ok(!capturedUrl.includes("?token="), "no ?token= querystring");
      assert.ok(!capturedUrl.includes("?api_key="), "no ?api_key= querystring");
      assert.equal(capturedHeaders["Authorization"], "Bearer vk_TESTKEY_1234");
      assert.equal(capturedHeaders["Accept"], "text/event-stream");
    });

    // ── Last-Event-ID persistence ────────────────────────────────────────

    test("after a successful agent-event frame, lastEventId persists to storage", async () => {
      const storage = fakeStorage();
      const fetchFn: typeof fetch = async () =>
        makeStreamResponse([
          "event: agent-event\nid: 42\ndata: {\"x\":1}\n\n",
        ]);
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
      await new Promise(r => setTimeout(r, 50));
      client.disconnect();
      assert.equal(storage.getItem("vigil:lastEventId"), "42");
      assert.equal(events.length, 1);
      assert.equal(events[0].id, "42");
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
      await new Promise(r => setTimeout(r, 20));
      client.disconnect();
      assert.equal(capturedHeaders["Last-Event-ID"], "99");
    });

    test("storage.setItem QuotaExceededError does not crash the loop", async () => {
      const storage = fakeStorage();
      (storage as any)._throwOnSet = true;
      const fetchFn: typeof fetch = async () =>
        makeStreamResponse(["event: agent-event\nid: 1\ndata: ok\n\n"]);
      let received = false;
      const client = createSseClient({
        url: "http://x/v1/agent-stream",
        apiKey: "vk_X",
        onEvent: () => { received = true; },
        storage,
        fetchFn,
        sleepFn: (_ms) => new Promise<void>((r) => setTimeout(r, 0)),
      });
      client.connect();
      await new Promise(r => setTimeout(r, 50));
      client.disconnect();
      assert.equal(received, true, "onEvent fired despite QuotaExceededError on setItem");
    });

    // ── State callbacks + ping silent drop ───────────────────────────────

    test("onStateChange(true) on first 200 OK; ping frames dropped silently", async () => {
      const fetchFn: typeof fetch = async () =>
        makeStreamResponse([
          "event: ping\ndata: \n\n",
          "event: agent-event\nid: 5\ndata: yes\n\n",
        ]);
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
      await new Promise(r => setTimeout(r, 50));
      client.disconnect();
      assert.ok(states.includes(true), "onStateChange(true) fired");
      assert.deepEqual(events, ["5"], "ping was dropped; only agent-event surfaced");
    });

    // ── Backoff timing ───────────────────────────────────────────────────

    test("disconnect → backoff schedule increments through array, capped at 30000", async () => {
      const sleeps: number[] = [];
      let attempt = 0;
      const fetchFn: typeof fetch = async () => {
        attempt++;
        // Always fail with an error so the loop iterates through backoff.
        throw new Error("simulated network error");
      };
      const client = createSseClient({
        url: "http://x/v1/agent-stream",
        apiKey: "vk_X",
        onEvent: () => {},
        storage: fakeStorage(),
        fetchFn,
        sleepFn: async (ms) => {
          sleeps.push(ms);
          // Don't actually sleep — just record. After 7 attempts, we'll stop.
          if (sleeps.length >= 7) {
            // Stop the loop so the test can complete
            await new Promise(r => setTimeout(r, 0));
          }
        },
      });
      client.connect();
      // Allow many iterations — we record sleeps until 7+ entries
      const deadline = Date.now() + 500;
      while (sleeps.length < 7 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5));
      }
      client.disconnect();
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
      let attempt = 0;
      const fetchFn: typeof fetch = async () => {
        attempt++;
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
        sleepFn: async (ms) => {
          sleeps.push(ms);
          // After two failures, allow the next attempt to succeed
          if (sleeps.length === 2) succeed = true;
        },
      });
      client.connect();
      const deadline = Date.now() + 500;
      while (sleeps.length < 4 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5));
      }
      client.disconnect();
      // sleeps[0] = 1000 (first failure)
      // sleeps[1] = 2000 (second failure)
      // ... then a success resets backoffIndex
      // sleeps[2] should be 1000 again (after success+EOF reset)
      assert.equal(sleeps[0], 1000);
      assert.equal(sleeps[1], 2000);
      assert.equal(sleeps[2], 1000, "successful connect reset backoffIndex");
    });
    ```
  </action>
  <verify>
    <automated>cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts 2>&1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts`
    - File contains 5 parseFrame tests + 1 BACKOFF_MS schedule test + bearer-hygiene + Last-Event-ID + state-callback + backoff timing tests (≥10 tests total)
    - Contains `bearer must NOT appear in URL` (grep exits 0)
    - Contains `[1000, 2000, 4000, 8000, 16000, 30000]` (grep exits 0; D-11 lock)
    - Contains `QuotaExceededError` (grep exits 0; Pitfall 4)
    - Contains `successful connect reset backoffIndex` (grep exits 0)
    - `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts` exits 0 with all tests passing
  </acceptance_criteria>
  <done>
    Parser correctness, backoff lock, bearer hygiene, Last-Event-ID persistence, QuotaExceededError survival, ping silent drop, state-callback transitions all pinned by tests.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| WebView → vigil-core | Bearer in `Authorization` header, never URL. |
| WebView → localStorage | `vigil:lastEventId` is a small integer string; no PII. |
| sse-client → consumer (Companion screen) | onEvent / onStateChange callbacks; consumer owns its own state. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-124-06-01 | Information Disclosure | Bearer key in URL → leaks to Railway HTTP-access logs | mitigate | Bearer placed in Authorization header. Test "bearer in Authorization header, NEVER in URL" pins this. CONTEXT D-04 + memory `feedback_railway_variables_leak`. |
| T-124-06-02 | Information Disclosure | Bearer key in console.log / error message | mitigate | Drift-detector grep on sse-client.ts: no console.* references to Authorization/Bearer/vk_/VITE_API_KEY/apiKey. Error path uses status-only message (`SSE HTTP ${res.status}`). |
| T-124-06-03 | Denial of Service | localStorage QuotaExceededError crashes the loop | mitigate | safeWriteStorage wraps setItem in try/catch (Pitfall 4). Test asserts onEvent still fires when setItem throws. |
| T-124-06-04 | Denial of Service | Reconnect storm with no backoff | mitigate | BACKOFF_MS lock + cap at 30s + reset on successful connect. Tests pin schedule + reset behavior. |
| T-124-06-05 | Tampering | Multi-byte UTF-8 character split across reader chunks corrupts data | mitigate | TextDecoder({stream:true}) per RESEARCH §"Don't Hand-Roll" + WHATWG decode spec. parseFrame is line-prefix-based and operates on the assembled buffer. |
| T-124-06-06 | Spoofing | Server emits a frame with `id` from another user (cross-user leak) | accept | This is a SERVER-side concern (Plan 03's bus.on(userId, ...) structurally enforces isolation). Plugin shim trusts the server's per-userId stream by virtue of bearer auth. If the server is compromised, the bearer is also compromised; plugin can't independently verify userId. |
</threat_model>

<verification>
- `cd vigil-g2-plugin && npx tsc --noEmit` — zero errors involving sse-client.ts or types.ts
- `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts` — all tests green
- `cd vigil-g2-plugin && npm test` — full plugin suite still green (smoke + sse-client + home drift detector from Plan 04)
- All grep-based bearer-hygiene acceptance criteria pass
</verification>

<success_criteria>
- AGENT-API-03 client-side: SSE shim consumes the server endpoint with bearer in header.
- AGENT-HUD-01 dependency: `onStateChange` callback hooks into Companion screen's offline indicator (Plan 07 consumes this).
- Backoff schedule locked exactly to D-11.
- Last-Event-ID persistence in WebView localStorage; survives QuotaExceededError.
- Zero new runtime npm deps (D-04 posture preserved).
- Bearer never logged anywhere.
</success_criteria>

<output>
After completion, create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-06-SUMMARY.md`.
</output>
