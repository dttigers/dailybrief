import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

/**
 * Phase 101 Plan 04 Task 2 — end-to-end deferred-commit delete integration.
 *
 * Exercises the full cycle wired across Plan 01 (useToast/ToastHost), Plan 02
 * (ContextMenu), and Plan 03 (ThoughtsPage handlers + filter-on-render):
 *
 *   - CTX-03 happy path: Delete → row hidden → Undo within 5s → row restored,
 *     NO API call fired.
 *   - 5s commit: Delete → timer expires → bulkDeleteThoughts called exactly
 *     once with [id], row stays hidden.
 *   - D-16 replace semantics: second Delete before first 5s expires → first
 *     delete commits immediately (replace-fires-previous-onExpire).
 *   - Error path (D-20): bulkDeleteThoughts rejects → row restored + error
 *     toast "Couldn't delete. Try again." shown.
 *   - D-20 move-to-category: menu → "Task" → updateThought called with
 *     { category: 'task' }.
 *
 * Timer + microtask pattern mirrors useThoughts.test.tsx:18-23 — vi.useFakeTimers
 * + act(async) + flushMicrotasks() to settle React 19 automatic batching.
 */

// Mock the API client module BEFORE the component imports — ThoughtsPage pulls
// these exports through useThoughts, useProjects, and its own api imports.
vi.mock('../api/client', () => ({
  getStoredKey: () => 'test-key',
  getThoughts: vi.fn(),
  createThought: vi.fn(),
  triageThought: vi.fn(),
  updateThought: vi.fn(),
  bulkDeleteThoughts: vi.fn(),
  bulkRecategorizeThoughts: vi.fn(),
  getProjects: vi.fn(),
  getTaskStatusFilter: vi.fn(),
  putTaskStatusFilter: vi.fn(),
  vigilFetch: vi.fn(),
}))

// useTimezone hits vigilFetch on mount — short-circuit with a stable tz so the
// week-window header renders deterministically without triggering network mock.
vi.mock('../hooks/useTimezone', () => ({
  useTimezone: () => ({ tz: 'America/New_York', isLoading: false, error: null }),
}))

import * as api from '../api/client'
import ThoughtsPage from './ThoughtsPage'
import { ToastProvider } from '../hooks/useToast'
import ToastHost from '../components/ToastHost'

const baseThought = {
  id: 1,
  content: 'first',
  category: 'idea',
  confidence: null,
  source: 'text',
  createdAt: '2026-04-17T00:00:00Z',
  modifiedAt: '2026-04-17T00:00:00Z',
  taskStatus: null,
  therapyClassification: null,
  tags: [] as string[],
  isFavorited: false,
  projectId: null,
}
const secondThought = { ...baseThought, id: 2, content: 'second' }

function wrap() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ThoughtsPage />
        <ToastHost />
      </ToastProvider>
    </MemoryRouter>,
  )
}

// Per useThoughts.test.tsx — two Promise.resolve ticks settle React 19's
// automatic batching plus the promise chain from the initial getThoughts call.
const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ThoughtsPage — deferred-commit delete (Phase 101 D-15, D-16)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(api.getThoughts).mockResolvedValue({
      data: [baseThought, secondThought],
      total: 2,
      limit: 50,
      offset: 0,
    })
    vi.mocked(api.bulkDeleteThoughts).mockResolvedValue({ deleted: 1 })
    vi.mocked(api.getProjects).mockResolvedValue([])
    vi.mocked(api.getTaskStatusFilter).mockResolvedValue('open')
    vi.mocked(api.putTaskStatusFilter).mockResolvedValue(undefined)
    vi.mocked(api.updateThought).mockResolvedValue(baseThought)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  async function openMenuAndClickDelete(rowText: string) {
    // Find the row's clickable content <p>, walk up to the row div that owns
    // the onContextMenu handler, then fire contextmenu on the row.
    const contentP = screen.getByText(rowText)
    const rowDiv = contentP.closest('div[tabindex="-1"]') ?? contentP
    fireEvent.contextMenu(rowDiv, { clientX: 50, clientY: 50 })
    await flushMicrotasks()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete$/ }))
    await flushMicrotasks()
  }

  it('Undo within 5s restores row and does NOT call bulkDeleteThoughts (CTX-03 happy path, deferred-commit)', async () => {
    wrap()
    // With fake timers active, waitFor() cannot advance time to poll — instead
    // flush the microtask queue a few times to settle useThoughts' initial
    // getThoughts promise chain, matching the useThoughts.test.tsx pattern.
    await flushMicrotasks()
    await flushMicrotasks()
    expect(api.getThoughts).toHaveBeenCalled()
    expect(screen.getByText('first')).toBeInTheDocument()

    await openMenuAndClickDelete('first')
    // Optimistic filter-on-render: the row must be hidden immediately.
    expect(screen.queryByText('first')).not.toBeInTheDocument()
    // Undo button sits on the toast.
    const undo = screen.getByRole('button', { name: /undo/i })
    fireEvent.click(undo)
    await flushMicrotasks()
    // Row restored, NO API call made (deferred-commit not fired).
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(api.bulkDeleteThoughts).not.toHaveBeenCalled()
  })

  it('commits via bulkDeleteThoughts after 5s if no Undo (D-15)', async () => {
    wrap()
    // With fake timers active, waitFor() cannot advance time to poll — instead
    // flush the microtask queue a few times to settle useThoughts' initial
    // getThoughts promise chain, matching the useThoughts.test.tsx pattern.
    await flushMicrotasks()
    await flushMicrotasks()
    expect(api.getThoughts).toHaveBeenCalled()

    await openMenuAndClickDelete('first')
    // Pre-commit: row hidden, API not yet called.
    expect(screen.queryByText('first')).not.toBeInTheDocument()
    expect(api.bulkDeleteThoughts).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.bulkDeleteThoughts).toHaveBeenCalledTimes(1)
    expect(api.bulkDeleteThoughts).toHaveBeenCalledWith([1])
    expect(screen.queryByText('first')).not.toBeInTheDocument()
  })

  it('second delete during first window commits first immediately (deferred-commit D-16 replace)', async () => {
    wrap()
    // With fake timers active, waitFor() cannot advance time to poll — instead
    // flush the microtask queue a few times to settle useThoughts' initial
    // getThoughts promise chain, matching the useThoughts.test.tsx pattern.
    await flushMicrotasks()
    await flushMicrotasks()
    expect(api.getThoughts).toHaveBeenCalled()

    await openMenuAndClickDelete('first')
    expect(screen.queryByText('first')).not.toBeInTheDocument()
    expect(api.bulkDeleteThoughts).not.toHaveBeenCalled()

    // Advance part-way through the first 5s window, then delete row 2.
    await act(async () => {
      vi.advanceTimersByTime(2_000)
      await Promise.resolve()
    })
    await openMenuAndClickDelete('second')
    await flushMicrotasks()

    // D-16: the first toast's onExpire must have fired synchronously before
    // the second toast replaced it → first delete committed immediately.
    expect(api.bulkDeleteThoughts).toHaveBeenNthCalledWith(1, [1])

    // Now let the second toast's 5s elapse — its onExpire commits row 2.
    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.bulkDeleteThoughts).toHaveBeenNthCalledWith(2, [2])
  })

  it('on API failure: restores row and shows error toast "Couldn\'t delete. Try again." (D-20)', async () => {
    vi.mocked(api.bulkDeleteThoughts).mockRejectedValueOnce(new Error('boom'))
    wrap()
    // With fake timers active, waitFor() cannot advance time to poll — instead
    // flush the microtask queue a few times to settle useThoughts' initial
    // getThoughts promise chain, matching the useThoughts.test.tsx pattern.
    await flushMicrotasks()
    await flushMicrotasks()
    expect(api.getThoughts).toHaveBeenCalled()

    await openMenuAndClickDelete('first')
    expect(screen.queryByText('first')).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.bulkDeleteThoughts).toHaveBeenCalledWith([1])
    // Row restored — filter-on-render un-hides once onExpire reverts.
    expect(screen.getByText('first')).toBeInTheDocument()
    // Error toast with the UI-SPEC-locked copy.
    expect(
      screen.getByText(/Couldn't delete\. Try again\./i),
    ).toBeInTheDocument()
  })

  it('Move to category → Task calls updateThought(id, { category: "task" }) (D-20)', async () => {
    wrap()
    // With fake timers active, waitFor() cannot advance time to poll — instead
    // flush the microtask queue a few times to settle useThoughts' initial
    // getThoughts promise chain, matching the useThoughts.test.tsx pattern.
    await flushMicrotasks()
    await flushMicrotasks()
    expect(api.getThoughts).toHaveBeenCalled()

    const contentP = screen.getByText('first')
    const rowDiv = contentP.closest('div[tabindex="-1"]') ?? contentP
    fireEvent.contextMenu(rowDiv, { clientX: 50, clientY: 50 })
    await flushMicrotasks()

    // Open the categories submenu (mobile-style inline-replace since the menu
    // was opened via touch? No — desktop via contextmenu. Desktop opens a
    // right-side submenu on HOVER; for a click-based test we fire the click
    // which under openedVia='mouse' is wired to handleMoveTap (no-op on
    // mouse). Use mouseEnter to open the desktop submenu.)
    const moveItem = screen.getByRole('menuitem', { name: /Move to category/ })
    fireEvent.mouseEnter(moveItem)
    await flushMicrotasks()

    // Click the Task category in the submenu.
    fireEvent.click(screen.getByRole('menuitem', { name: /^Task$/i }))
    await flushMicrotasks()

    expect(api.updateThought).toHaveBeenCalledWith(1, { category: 'task' })
    expect(api.bulkDeleteThoughts).not.toHaveBeenCalled()
  })
})
