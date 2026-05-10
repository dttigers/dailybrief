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

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const
const STORAGE_KEY = "vigil:lastEventId"

type EventCallback = (id: string, data: string) => void
type StateCallback = (connected: boolean) => void

export interface SseClientOptions {
  url: string
  apiKey: string
  onEvent: EventCallback
  // Phase 125 (AGENT-HUD-03 / D-02): quiet_mode_changed SSE event dispatch.
  // Server emits this BOTH as a synthetic state-bootstrap frame on every
  // connect (D-03) AND as a live frame on every PWA toggle. Both paths
  // call this callback with the raw JSON `data` string ({enabled, since}).
  // Optional — Phase 124 callers (no quiet-mode awareness) still compile.
  onQuietMode?: (data: string) => void
  onStateChange?: StateCallback
  // Injection seams for unit tests
  storage?: Pick<Storage, "getItem" | "setItem">
  fetchFn?: typeof fetch
  // setTimeout/clearTimeout injection for fake-timer tests
  sleepFn?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function safeWriteStorage(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  value: string,
): void {
  try {
    storage.setItem(key, value)
  } catch {
    // QuotaExceededError or storage disabled — replay still works on next
    // reconnect via the next event we receive (RESEARCH Pitfall 4).
  }
}

export function parseFrame(
  frame: string,
): { event: string; data: string; id: string | null } {
  let event = "message"
  const dataLines: string[] = []
  let id: string | null = null
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue // SSE comment
    if (line.startsWith("event:")) event = line.slice(6).trimStart()
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
    else if (line.startsWith("id:")) id = line.slice(3).trimStart()
  }
  return { event, data: dataLines.join("\n"), id }
}

export function createSseClient(opts: SseClientOptions): {
  connect(): void
  disconnect(): void
} {
  const storage = opts.storage ?? globalThis.localStorage
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis)
  const sleep = opts.sleepFn ?? defaultSleep

  let abortController: AbortController | null = null
  let backoffIndex = 0
  let stopped = false
  let loopRunning = false

  async function loop(): Promise<void> {
    if (loopRunning) return
    loopRunning = true
    try {
      while (!stopped) {
        abortController = new AbortController()
        const lastEventId = storage.getItem(STORAGE_KEY)
        const headers: Record<string, string> = {
          "Authorization": `Bearer ${opts.apiKey}`,
          "Accept": "text/event-stream",
        }
        if (lastEventId) headers["Last-Event-ID"] = lastEventId

        try {
          const res = await fetchFn(opts.url, {
            headers,
            signal: abortController.signal,
          })
          if (!res.ok || !res.body) {
            // Surface only status/shape — never the response body or
            // Authorization header.
            throw new Error(`SSE HTTP ${res.status}`)
          }
          opts.onStateChange?.(true)
          backoffIndex = 0

          const reader = res.body.getReader()
          const decoder = new TextDecoder("utf-8")
          let buffer = ""
          while (!stopped) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let idx
            while ((idx = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, idx)
              buffer = buffer.slice(idx + 2)
              const parsed = parseFrame(frame)
              if (parsed.event === "ping") continue // server keepalive
              if (parsed.event === "agent-event" && parsed.id) {
                safeWriteStorage(storage, STORAGE_KEY, parsed.id)
                opts.onEvent(parsed.id, parsed.data)
              } else if (parsed.event === "quiet_mode_changed") {
                // Phase 125 (AGENT-HUD-03 / D-02): plugin-side dispatch for
                // the new SSE event type. Server emits this BOTH as a
                // synthetic state-bootstrap frame on every connect (D-03)
                // AND as a live frame on every PWA toggle. Plugin treats
                // both identically — setQuietMode is idempotent.
                opts.onQuietMode?.(parsed.data)
              }
            }
          }
          // EOF without explicit stop → fall through to reconnect
          if (!stopped) {
            opts.onStateChange?.(false)
          }
        } catch (_err) {
          if (stopped) return
          opts.onStateChange?.(false)
        }

        if (stopped) return
        const wait = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)]!
        backoffIndex = Math.min(backoffIndex + 1, BACKOFF_MS.length - 1)
        await sleep(wait)
      }
    } finally {
      loopRunning = false
    }
  }

  return {
    connect(): void {
      stopped = false
      backoffIndex = 0
      void loop()
    },
    disconnect(): void {
      stopped = true
      abortController?.abort()
    },
  }
}
