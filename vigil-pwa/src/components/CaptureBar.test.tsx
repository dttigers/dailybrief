// Phase 999.2 Plan 01 — pins CAP-MULTI-01..05 + D-04 post-submit reset + D-07
// whitespace guard. Mirrors AuthPage.test.tsx for the userEvent precedent and
// ThoughtRow.test.tsx for the stub-thought fixture shape.
// RESEARCH pitfalls observed (zero layout assertions, paste/keyboard via
// userEvent only, plain-Enter trap test preserved).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CaptureBar from './CaptureBar'
import * as api from '../api/client'
import type { ThoughtApiResponse } from '../api/client'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof api>('../api/client')
  return {
    ...actual,
    createThought: vi.fn(),
    triageThought: vi.fn().mockResolvedValue({ category: 'idea', confidence: 0.9 }),
    updateThought: vi.fn().mockResolvedValue({}),
  }
})

const stubThought: ThoughtApiResponse = {
  id: 1,
  content: 'x',
  category: 'idea',
  confidence: null,
  source: 'text',
  createdAt: '2026-05-19T00:00:00Z',
  modifiedAt: '2026-05-19T00:00:00Z',
  taskStatus: null,
  therapyClassification: null,
  tags: [],
  isFavorited: false,
  projectId: null,
}

describe('CaptureBar — multi-line input (Phase 999.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.createThought).mockResolvedValue(stubThought)
    vi.mocked(api.triageThought).mockResolvedValue({ category: 'idea', confidence: 0.9 })
    vi.mocked(api.updateThought).mockResolvedValue(stubThought)
  })

  it('CAP-MULTI-02: paste preserves \\n into textarea value', async () => {
    const user = userEvent.setup()
    render(<CaptureBar onCapture={vi.fn()} onCategoryUpdate={vi.fn()} />)
    const ta = screen.getByPlaceholderText('Capture a thought...') as HTMLTextAreaElement
    await user.click(ta)
    await user.paste('line one\nline two\nline three')
    expect(ta.value).toBe('line one\nline two\nline three')
  })

  it('CAP-MULTI-01 / D-01: Cmd+Enter submits with the multi-line content', async () => {
    const onCapture = vi.fn()
    const user = userEvent.setup()
    render(<CaptureBar onCapture={onCapture} onCategoryUpdate={vi.fn()} />)
    const ta = screen.getByPlaceholderText('Capture a thought...') as HTMLTextAreaElement
    await user.click(ta)
    await user.paste('a\nb')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(api.createThought).toHaveBeenCalledWith('a\nb'))
    await waitFor(() => expect(onCapture).toHaveBeenCalledWith(stubThought))
  })

  // Regression trap for RESEARCH Pitfall 3 — never delete.
  it('CAP-MULTI-01 / D-01: plain Enter inserts newline and does NOT submit', async () => {
    const user = userEvent.setup()
    render(<CaptureBar onCapture={vi.fn()} onCategoryUpdate={vi.fn()} />)
    const ta = screen.getByPlaceholderText('Capture a thought...') as HTMLTextAreaElement
    await user.click(ta)
    await user.type(ta, 'first{Enter}second')
    expect(ta.value).toBe('first\nsecond')
    expect(api.createThought).not.toHaveBeenCalled()
  })

  it('CAP-MULTI-04 / D-07: whitespace-only input is rejected', async () => {
    const user = userEvent.setup()
    render(<CaptureBar onCapture={vi.fn()} onCategoryUpdate={vi.fn()} />)
    const ta = screen.getByPlaceholderText('Capture a thought...') as HTMLTextAreaElement
    await user.click(ta)
    await user.type(ta, '   {Enter}{Enter}   ')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(api.createThought).not.toHaveBeenCalled()
  })

  it('D-04: textarea value clears after successful submit', async () => {
    const user = userEvent.setup()
    render(<CaptureBar onCapture={vi.fn()} onCategoryUpdate={vi.fn()} />)
    const ta = screen.getByPlaceholderText('Capture a thought...') as HTMLTextAreaElement
    await user.click(ta)
    await user.type(ta, 'hello')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(ta.value).toBe(''))
  })

  it('CAP-MULTI-05 / D-05: textarea has enterKeyHint="enter"', () => {
    render(<CaptureBar onCapture={vi.fn()} onCategoryUpdate={vi.fn()} />)
    const ta = screen.getByPlaceholderText('Capture a thought...')
    expect(ta).toHaveAttribute('enterKeyHint', 'enter')
  })

  it('D-02 / CAP-MULTI-03: Save button disabled when empty or whitespace-only, enabled with real content', async () => {
    const user = userEvent.setup()
    render(<CaptureBar onCapture={vi.fn()} onCategoryUpdate={vi.fn()} />)
    const save = screen.getByRole('button', { name: /save/i })
    expect(save).toBeDisabled()
    const ta = screen.getByPlaceholderText('Capture a thought...') as HTMLTextAreaElement
    await user.click(ta)
    await user.type(ta, '   ')
    expect(save).toBeDisabled()
    await user.type(ta, 'real content')
    expect(save).toBeEnabled()
  })
})
