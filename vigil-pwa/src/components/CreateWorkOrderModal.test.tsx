import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import CreateWorkOrderModal from './CreateWorkOrderModal'

/**
 * Phase 129.1-05 Task 2 — CreateWorkOrderModal tests.
 *
 * Covers WO-MANUAL-01 (manual create form) + case_number form-level regex
 * validation. The `department` field is labeled "Maintenance Location" in the
 * UI per the Phase 129.1-03 operator decision (option b — Polaris field
 * mapping); the underlying field name in the payload stays as `department`.
 */
describe('CreateWorkOrderModal', () => {
  function renderModal(overrides: {
    onCreate?: (input: Record<string, unknown>) => Promise<void>
    onClose?: () => void
  } = {}) {
    const onCreate = overrides.onCreate ?? vi.fn().mockResolvedValue(undefined)
    const onClose = overrides.onClose ?? vi.fn()
    const utils = render(<CreateWorkOrderModal onClose={onClose} onCreate={onCreate} />)
    return { ...utils, onCreate, onClose }
  }

  it('renders all 11 editable input fields (case_number, store, short_description, trade, location, equipment, priority, contact, notes, maintenance_problem, department)', () => {
    renderModal()
    // Case number — text input, required
    expect(screen.getByLabelText(/case number/i)).toBeInTheDocument()
    // Store
    expect(screen.getByLabelText(/^store$/i)).toBeInTheDocument()
    // Short description — required textarea
    expect(screen.getByLabelText(/short description/i)).toBeInTheDocument()
    // Trade
    expect(screen.getByLabelText(/^trade$/i)).toBeInTheDocument()
    // Location
    expect(screen.getByLabelText(/^location$/i)).toBeInTheDocument()
    // Equipment
    expect(screen.getByLabelText(/^equipment$/i)).toBeInTheDocument()
    // Priority — select with Low/Medium/High/Critical
    expect(screen.getByLabelText(/^priority$/i)).toBeInTheDocument()
    // Contact
    expect(screen.getByLabelText(/^contact$/i)).toBeInTheDocument()
    // Notes — textarea
    expect(screen.getByLabelText(/^notes$/i)).toBeInTheDocument()
    // Maintenance problem
    expect(screen.getByLabelText(/maintenance problem/i)).toBeInTheDocument()
    // Maintenance Location (user-facing label for the `department` column —
    // operator decision Phase 129.1-03 Q1)
    expect(screen.getByLabelText(/maintenance location/i)).toBeInTheDocument()
  })

  it('rejects lowercase case_number — Submit disabled, inline error visible', () => {
    renderModal()
    const cn = screen.getByLabelText(/case number/i) as HTMLInputElement
    fireEvent.change(cn, { target: { value: 'cs1234' } })
    // Fill required short_description so the only blocker is case_number
    const sd = screen.getByLabelText(/short description/i) as HTMLTextAreaElement
    fireEvent.change(sd, { target: { value: 'broken sink' } })
    expect(
      screen.getByText(/case number must contain only A-Z and 0-9/i),
    ).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /create/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('accepts uppercase + digits case_number — Submit enabled, no error', () => {
    renderModal()
    const cn = screen.getByLabelText(/case number/i) as HTMLInputElement
    fireEvent.change(cn, { target: { value: 'CS1234' } })
    const sd = screen.getByLabelText(/short description/i) as HTMLTextAreaElement
    fireEvent.change(sd, { target: { value: 'broken sink' } })
    expect(
      screen.queryByText(/case number must contain only A-Z and 0-9/i),
    ).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /create/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
  })

  it('Submit calls onCreate with all 11 fields including maintenanceProblem + department', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderModal({ onCreate, onClose })

    // Fill all 11 fields
    fireEvent.change(screen.getByLabelText(/case number/i), {
      target: { value: 'CS9999' },
    })
    fireEvent.change(screen.getByLabelText(/^store$/i), {
      target: { value: '0123' },
    })
    fireEvent.change(screen.getByLabelText(/short description/i), {
      target: { value: 'broken sink' },
    })
    fireEvent.change(screen.getByLabelText(/^trade$/i), {
      target: { value: 'Plumbing' },
    })
    fireEvent.change(screen.getByLabelText(/^location$/i), {
      target: { value: 'Back room' },
    })
    fireEvent.change(screen.getByLabelText(/^equipment$/i), {
      target: { value: 'Sink' },
    })
    fireEvent.change(screen.getByLabelText(/^priority$/i), {
      target: { value: 'High' },
    })
    fireEvent.change(screen.getByLabelText(/^contact$/i), {
      target: { value: 'Jane' },
    })
    fireEvent.change(screen.getByLabelText(/^notes$/i), {
      target: { value: 'urgent' },
    })
    fireEvent.change(screen.getByLabelText(/maintenance problem/i), {
      target: { value: 'Leak' },
    })
    fireEvent.change(screen.getByLabelText(/maintenance location/i), {
      target: { value: 'Bakery' },
    })

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const payload = onCreate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.caseNumber).toBe('CS9999')
    expect(payload.store).toBe('0123')
    expect(payload.shortDescription).toBe('broken sink')
    expect(payload.trade).toBe('Plumbing')
    expect(payload.location).toBe('Back room')
    expect(payload.equipment).toBe('Sink')
    expect(payload.priority).toBe('High')
    expect(payload.contact).toBe('Jane')
    expect(payload.notes).toBe('urgent')
    expect(payload.maintenanceProblem).toBe('Leak')
    expect(payload.department).toBe('Bakery')
  })

  it('Submit triggers onClose after successful onCreate', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderModal({ onCreate, onClose })

    fireEvent.change(screen.getByLabelText(/case number/i), {
      target: { value: 'CS1' },
    })
    fireEvent.change(screen.getByLabelText(/short description/i), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('outside-click on overlay calls onClose', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    // The outermost div is the overlay; click it.
    const overlay = container.firstElementChild as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape key calls onClose', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces inline error when onCreate rejects', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Failed to create work order: 500'))
    const onClose = vi.fn()
    renderModal({ onCreate, onClose })

    fireEvent.change(screen.getByLabelText(/case number/i), {
      target: { value: 'CS1' },
    })
    fireEvent.change(screen.getByLabelText(/short description/i), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    // The modal should NOT close on rejection
    expect(onClose).not.toHaveBeenCalled()
    // Inline error rendered
    await waitFor(() =>
      expect(screen.getByText(/failed to create work order/i)).toBeInTheDocument(),
    )
  })
})
