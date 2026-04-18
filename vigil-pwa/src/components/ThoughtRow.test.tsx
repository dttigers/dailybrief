import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import ThoughtRow from './ThoughtRow'
import type { ThoughtApiResponse } from '../api/client'

const baseThought: ThoughtApiResponse = {
  id: 42,
  content: 'hello',
  category: 'idea',
  confidence: null,
  source: 'text',
  createdAt: '2026-04-17T00:00:00Z',
  modifiedAt: '2026-04-17T00:00:00Z',
  taskStatus: null,
  therapyClassification: null,
  tags: [],
  isFavorited: false,
  projectId: null,
}

describe('ThoughtRow — edit lifecycle events', () => {
  let startSpy: ReturnType<typeof vi.fn>
  let endSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    startSpy = vi.fn()
    endSpy = vi.fn()
    window.addEventListener('vigil:edit-started', startSpy)
    window.addEventListener('vigil:edit-ended', endSpy)
  })

  afterEach(() => {
    window.removeEventListener('vigil:edit-started', startSpy)
    window.removeEventListener('vigil:edit-ended', endSpy)
  })

  it('dispatches vigil:edit-started on content click', () => {
    const onUpdate = vi.fn()
    const { getByText } = render(
      <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
    )
    fireEvent.click(getByText('hello'))
    expect(startSpy).toHaveBeenCalledTimes(1)
    const ev = startSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
    expect(ev.detail).toEqual({ id: 42 })
  })

  it('dispatches vigil:edit-ended on save (via Cmd+Enter)', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const { getByText, getByRole } = render(
      <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
    )
    // Enter edit mode.
    fireEvent.click(getByText('hello'))
    startSpy.mockClear()

    const textarea = getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'newvalue' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(endSpy).toHaveBeenCalled())
    const ev = endSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
    expect(ev.detail).toEqual({ id: 42 })

    expect(onUpdate).toHaveBeenCalledWith(42, { content: 'newvalue' })
  })

  it('dispatches vigil:edit-ended on Escape', () => {
    const onUpdate = vi.fn()
    const { getByText, getByRole } = render(
      <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
    )
    fireEvent.click(getByText('hello'))
    startSpy.mockClear()
    endSpy.mockClear()

    const textarea = getByRole('textbox') as HTMLTextAreaElement
    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(endSpy).toHaveBeenCalledTimes(1)
    const ev = endSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
    expect(ev.detail).toEqual({ id: 42 })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('dispatches vigil:edit-ended on blur (save path)', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const { getByText, getByRole } = render(
      <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
    )
    fireEvent.click(getByText('hello'))
    startSpy.mockClear()
    endSpy.mockClear()

    const textarea = getByRole('textbox') as HTMLTextAreaElement
    // Blur without changes — handleSave no-change early-exit should fire end.
    fireEvent.blur(textarea)

    await waitFor(() => expect(endSpy).toHaveBeenCalled())
    const ev = endSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
    expect(ev.detail).toEqual({ id: 42 })
  })

  it('dispatches vigil:edit-ended on unmount while isEditing', () => {
    const onUpdate = vi.fn()
    const { getByText, unmount } = render(
      <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
    )
    fireEvent.click(getByText('hello'))
    startSpy.mockClear()
    endSpy.mockClear()

    unmount()

    expect(endSpy).toHaveBeenCalledTimes(1)
    const ev = endSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
    expect(ev.detail).toEqual({ id: 42 })
  })

  it('does NOT dispatch vigil:edit-ended on unmount when not editing', () => {
    const onUpdate = vi.fn()
    const { unmount } = render(
      <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
    )
    // Never click into edit mode.
    unmount()
    expect(endSpy).not.toHaveBeenCalled()
  })

  it('dispatches vigil:edit-ended even when onUpdate rejects', async () => {
    // WR-03: Pins D-11's "fire even if onUpdate threw" invariant — a
    // regression that moves the dispatch out of `finally` would slip past
    // every other test. Silence the expected console.error from WR-02's
    // catch so the suite stays quiet.
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    try {
      const onUpdate = vi.fn().mockRejectedValue(new Error('network'))
      const { getByText, getByRole } = render(
        <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
      )
      fireEvent.click(getByText('hello'))
      startSpy.mockClear()
      endSpy.mockClear()

      const textarea = getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'newvalue' } })
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

      await waitFor(() => expect(endSpy).toHaveBeenCalledTimes(1))
      const ev = endSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
      expect(ev.detail).toEqual({ id: 42 })
      expect(onUpdate).toHaveBeenCalledWith(42, { content: 'newvalue' })
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
