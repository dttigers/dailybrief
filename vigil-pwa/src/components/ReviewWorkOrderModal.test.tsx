import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import ReviewWorkOrderModal from './ReviewWorkOrderModal'
import type { WorkOrderApiResponse } from '../api/client'

/**
 * Phase 129.1-05 Task 3 — ReviewWorkOrderModal tests.
 *
 * Covers WO-MANUAL-02 (operator reviews a pending_review draft created by the
 * screenshot endpoint, edits + commits OR discards).
 */

function makeWorkOrder(overrides: Partial<WorkOrderApiResponse> = {}): WorkOrderApiResponse {
  return {
    caseNumber: 'CS9999',
    store: 'Store123',
    shortDescription: 'broken sink',
    trade: 'Plumbing',
    location: 'Back room',
    equipment: 'Sink',
    priority: 'High',
    contact: 'Jane',
    state: 'pending_review',
    notes: '',
    status: 'open',
    syncedAt: '2026-05-17T12:00:00Z',
    lastChangeAt: null,
    lastChangeSummary: null,
    archivedAt: null,
    ...overrides,
  }
}

describe('ReviewWorkOrderModal', () => {
  let originalConfirm: typeof window.confirm

  beforeEach(() => {
    originalConfirm = window.confirm
  })

  afterEach(() => {
    window.confirm = originalConfirm
  })

  function renderModal(overrides: {
    workOrder?: WorkOrderApiResponse
    onClose?: () => void
    onCommit?: (caseNumber: string, edits: Record<string, unknown>) => Promise<void>
    onDiscard?: (caseNumber: string) => Promise<void>
  } = {}) {
    const workOrder = overrides.workOrder ?? makeWorkOrder()
    const onClose = overrides.onClose ?? vi.fn()
    const onCommit = overrides.onCommit ?? vi.fn().mockResolvedValue(undefined)
    const onDiscard = overrides.onDiscard ?? vi.fn().mockResolvedValue(undefined)
    const utils = render(
      <ReviewWorkOrderModal
        workOrder={workOrder}
        onClose={onClose}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    )
    return { ...utils, workOrder, onClose, onCommit, onDiscard }
  }

  it('pre-populates form fields from workOrder prop', () => {
    renderModal({
      workOrder: makeWorkOrder({
        caseNumber: 'CS7777',
        shortDescription: 'leaky pipe',
        trade: 'Plumbing',
        priority: 'Medium',
      }),
    })
    const cn = screen.getByLabelText(/case number/i) as HTMLInputElement
    expect(cn.value).toBe('CS7777')
    const sd = screen.getByLabelText(/short description/i) as HTMLTextAreaElement
    expect(sd.value).toBe('leaky pipe')
    const tr = screen.getByLabelText(/^trade$/i) as HTMLInputElement
    expect(tr.value).toBe('Plumbing')
    const pr = screen.getByLabelText(/^priority$/i) as HTMLSelectElement
    expect(pr.value).toBe('Medium')
  })

  it('extras JSON collapsible renders parsed JSON when workOrder.notes is valid JSON', () => {
    const extras = { rawTitle: 'CS9999 — Sink overflow', priorityRaw: 'P2', assignedTo: 'team-a' }
    renderModal({
      workOrder: makeWorkOrder({ notes: JSON.stringify(extras) }),
    })
    // The details element should exist
    const details = screen.getByText(/extras|extra extracted fields/i).closest('details')
    expect(details).toBeTruthy()
    // The raw fields should be rendered inside the pre-formatted block
    const pre = details?.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre!.textContent).toContain('rawTitle')
    expect(pre!.textContent).toContain('priorityRaw')
  })

  it('extras JSON gracefully handles non-JSON notes (no crash, empty state shown)', () => {
    renderModal({
      workOrder: makeWorkOrder({ notes: 'not-json-just-a-string' }),
    })
    // Modal should render (no crash). Extras section should still exist but
    // either empty or showing the raw text.
    expect(screen.getByLabelText(/case number/i)).toBeInTheDocument()
  })

  it('Commit button calls onCommit with caseNumber + edits diff, then onClose', async () => {
    const wo = makeWorkOrder({
      caseNumber: 'CS7777',
      shortDescription: 'old',
    })
    const onCommit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderModal({ workOrder: wo, onCommit, onClose })

    // Operator edits the shortDescription
    const sd = screen.getByLabelText(/short description/i) as HTMLTextAreaElement
    fireEvent.change(sd, { target: { value: 'updated' } })

    fireEvent.click(screen.getByRole('button', { name: /^commit/i }))

    await waitFor(() => expect(onCommit).toHaveBeenCalled())
    const [caseNumber, edits] = onCommit.mock.calls[0]
    expect(caseNumber).toBe('CS7777')
    expect(edits.shortDescription).toBe('updated')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('Discard button calls onDiscard after confirm returns true', async () => {
    const wo = makeWorkOrder({ caseNumber: 'CS5555' })
    const onDiscard = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    window.confirm = vi.fn().mockReturnValue(true)
    renderModal({ workOrder: wo, onDiscard, onClose })

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    await waitFor(() => expect(onDiscard).toHaveBeenCalledWith('CS5555'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('Discard button does NOT call onDiscard when confirm returns false', () => {
    const onDiscard = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    window.confirm = vi.fn().mockReturnValue(false)
    renderModal({ onDiscard, onClose })

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(onDiscard).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape key calls onClose', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('outside-click on overlay calls onClose', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    const overlay = container.firstElementChild as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
