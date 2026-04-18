import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the api client BEFORE importing the hook so the hook's import resolves to the mock.
vi.mock('../api/client', () => ({
  getThoughts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
}))

import { getThoughts } from '../api/client'
import { useThoughts } from './useThoughts'

const mockGetThoughts = getThoughts as unknown as ReturnType<typeof vi.fn>

// Helper: let the initial getThoughts promise chain resolve under fake timers.
// vi.runOnlyPendingTimersAsync processes pending timers AND flushes the microtask
// queue, which is what we need to settle the fetch chain without advancing real
// interval time.
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useThoughts — edit-aware pause gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetThoughts.mockClear()
    mockGetThoughts.mockResolvedValue({ data: [], total: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pauses 30s interval while edit is active', async () => {
    renderHook(() => useThoughts(null, '', undefined))
    // Initial fetch fires on mount — let its promise chain settle.
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Advance 60s: two 30s ticks should fire, each calling refetch → getThoughts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(mockGetThoughts).toHaveBeenCalledTimes(3) // initial + 2 polls

    // Start an edit — polls should pause.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 1 } }),
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    // No polls should have fired while paused.
    expect(mockGetThoughts).toHaveBeenCalledTimes(3)

    // End the edit — one catch-up fires immediately.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 1 } }),
      )
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(4)

    // Interval restarted from resume moment — next tick at +30s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockGetThoughts).toHaveBeenCalledTimes(5)

    // And another at +60s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockGetThoughts).toHaveBeenCalledTimes(6)
  })

  it('pauses visibilitychange refetch during edit', async () => {
    renderHook(() => useThoughts(null, '', undefined))
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Begin edit.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 1 } }),
      )
    })

    // Simulate visibilitychange to visible — gate should suppress refetch.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // End edit — catch-up fires.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 1 } }),
      )
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(2)
  })

  it('pauses vigil:thought-created refetch during edit', async () => {
    renderHook(() => useThoughts(null, '', undefined))
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Begin edit.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 1 } }),
      )
    })

    // External thought-created event should be suppressed.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('vigil:thought-created'))
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // End edit — exactly one catch-up.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 1 } }),
      )
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(2)
  })

  it('refcount with two concurrent edits stays paused until both end', async () => {
    renderHook(() => useThoughts(null, '', undefined))
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Two concurrent edits.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 1 } }),
      )
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 2 } }),
      )
    })

    // 120s paused — no polls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // End one — refcount still 1, no catch-up.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 1 } }),
      )
    })
    await flushMicrotasks()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // End the other — now refcount hits 0, exactly one catch-up.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 2 } }),
      )
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(2)
  })

  it('stray vigil:edit-ended without matching start is a no-op', async () => {
    renderHook(() => useThoughts(null, '', undefined))
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Stray end — should NOT trigger catch-up (no N→0 transition where N>0).
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 99 } }),
      )
    })
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Normal polling continues.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockGetThoughts).toHaveBeenCalledTimes(2)
  })

  it('duplicate vigil:edit-started with same id does not double-increment', async () => {
    renderHook(() => useThoughts(null, '', undefined))
    await flushMicrotasks()
    expect(mockGetThoughts).toHaveBeenCalledTimes(1)

    // Two starts with same id.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 1 } }),
      )
      window.dispatchEvent(
        new CustomEvent('vigil:edit-started', { detail: { id: 1 } }),
      )
    })

    // Single end should clear the Set (Set.add is idempotent on same id).
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: 1 } }),
      )
    })
    await flushMicrotasks()
    // Exactly one catch-up fires.
    expect(mockGetThoughts).toHaveBeenCalledTimes(2)
  })
})
