// ── Phase 130 Plan 03 (VOICE-06 / D-X1 step 4) ─────────────────────────────
// PWA SSE subscriber for /v1/agent-stream. Bridges cross-device G2-origin
// voice captures into the existing `vigil:thought-created` window-event
// pathway that `useThoughts.ts:127` already listens for — zero changes to
// useThoughts itself (additive wiring only).
//
// Flow (PATTERNS.md lines 638-657):
//   1. G2 records → POST /v1/voice/transcribe → server INSERTs thought row
//   2. server calls `bus.emitThoughtCreated(userId, { thoughtId, content })`
//   3. /v1/agent-stream multiplexes a `thought-created` SSE frame
//   4. THIS HOOK reads that frame and dispatches a
//      `vigil:thought-created` window event
//   5. `useThoughts.ts:127` existing listener calls `refetch()` → dashboard
//      renders the new row within 8 s of utterance end (VOICE-06 closes
//      structurally; Plan 07 hardware wallclock verifies)
//
// Why a fetch-stream (not EventSource)?
//   The native `EventSource` API does NOT support custom request headers
//   (the WHATWG spec deliberately omits the option), so we cannot attach
//   `Authorization: Bearer <jwt>` — which is the only auth credential the
//   server accepts on `/v1/agent-stream`. The fetch-stream approach below
//   uses `fetch(url, { headers })` with a streaming body, then manually
//   parses SSE frames from the byte stream. Pattern mirrors the existing
//   agent-stream.test.ts harness (lines 118-156).
//
// Auth: Bearer JWT pulled from sessionStorage via getStoredKey() (matches
//   vigilFetch in api/client.ts).
//
// Lifecycle: the hook opens the stream on mount and tears it down on
//   unmount via AbortController. If the stream errors or closes
//   prematurely, the hook does NOT auto-reconnect in Phase 130 — the
//   existing useThoughts 30s poll remains as a backstop. Auto-reconnect is
//   a v3.10 candidate.
//
// Cross-tab note: when multiple PWA tabs are open, each tab opens its own
//   SSE connection; the server's per-userId emitter Map fans out to every
//   subscriber for that userId, so all tabs receive the frame and dispatch
//   the window event. The duplicate refetches are idempotent (the existing
//   30 s poll already deduplicates concurrent fetches via the
//   `cancelled` flag in useThoughts.ts).
import { useEffect } from 'react'
import { API_BASE, getStoredKey } from '../api/client'

/**
 * Open an authenticated SSE stream to /v1/agent-stream and dispatch a
 * `vigil:thought-created` window event whenever the server emits a
 * `thought-created` SSE frame.
 *
 * Mount this hook ONCE at the App root (or any always-mounted layout
 * component) so the cross-device G2-origin voice path triggers the
 * existing useThoughts refetch listener regardless of which page the
 * operator is viewing.
 *
 * The hook is a no-op when the user is signed out (no JWT in storage).
 *
 * @internal The hook does not return a value — it has effect-only
 * semantics. Consumers should mount it once at the App root.
 */
export function useAgentStream(): void {
  useEffect(() => {
    // Read JWT lazily so a sign-in mid-session picks up the new token on
    // the next mount cycle. If no JWT is stored, the user is unauth'd —
    // bail out without opening the stream.
    const jwt = getStoredKey()
    if (!jwt) return

    const controller = new AbortController()
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/agent-stream`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          // Don't escalate — a 401 here means the JWT expired, which the
          // app's existing /v1/summary poll will catch and route through
          // the `vigil:signout` cross-cutting handler. Bail silently.
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          // Parse SSE frames (separated by \n\n). Each frame is a block of
          // `field: value` lines. We only care about the `event:` field.
          let idx
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const rawFrame = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const lines = rawFrame.split('\n')
            let event: string | undefined
            // Note: we read the `data` field shape but do NOT pass it
            // forward — the existing `vigil:thought-created` listener in
            // useThoughts.ts:127 calls `refetch()` which re-queries the
            // server (source-of-truth wins). Documented here for future
            // optimization: `e.data` is JSON-encoded `{ thoughtId, content }`.
            for (const line of lines) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
            }
            if (event === 'thought-created') {
              // Dispatch the existing window event — matches the
              // dispatchers in usePhotoUpload.ts:182 and
              // AudioUploadSection.tsx:54. useThoughts.ts:127 already
              // listens for this exact event and triggers a refetch.
              window.dispatchEvent(new CustomEvent('vigil:thought-created'))
            }
            // Other SSE event types (`agent-event`, `quiet_mode_changed`,
            // `ping`) are consumed by other subscribers / are not the
            // concern of this hook. The G2 plugin is the canonical
            // `agent-event` subscriber; the PWA does not need that
            // channel today.
          }
        }
      } catch (err) {
        // AbortError on unmount is expected. Any other error is logged
        // for dev visibility but does NOT escalate — useThoughts 30s
        // poll provides the freshness backstop.
        if ((err as Error).name === 'AbortError') return
        if (import.meta.env.DEV) {
          console.warn('[useAgentStream] SSE stream closed unexpectedly:', err)
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
    // Hook intentionally has no deps — opens once per mount cycle. If the
    // operator signs out and back in, the App-level mount/unmount cycle
    // around the route guard will re-trigger this effect with the new JWT.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
