import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  fireEvent,
  waitFor,
  act,
  createEvent,
  screen,
} from '@testing-library/react'
import ThoughtRow from './ThoughtRow'
import type { ThoughtApiResponse, ProjectApiResponse } from '../api/client'

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

const baseProjects: ProjectApiResponse[] = [
  { id: 1, name: 'Alpha', description: null, status: null, createdAt: '', updatedAt: '' },
  { id: 2, name: 'Beta', description: null, status: null, createdAt: '', updatedAt: '' },
]

// Phase 101 helper — advance fake timers inside act() so long-press timers
// flush React state updates synchronously.
function clockAdvance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
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

describe('ThoughtRow — context menu triggers (Phase 101)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('right-click dispatches onContextMenu and opens menu portal (CTX-01, D-01)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    fireEvent.contextMenu(getByText('hello'), { clientX: 250, clientY: 300 })
    expect(document.querySelector('[role="menu"]')).toBeTruthy()
  })

  it('right-click calls e.preventDefault to suppress native menu (D-01)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = getByText('hello')
    const ev = createEvent.contextMenu(row, { clientX: 250, clientY: 300 })
    fireEvent(row, ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('right-click does NOT open menu while isEditing (D-03)', () => {
    const { getByText, getByRole } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    // Enter edit mode.
    fireEvent.click(getByText('hello'))
    const textarea = getByRole('textbox') as HTMLTextAreaElement
    fireEvent.contextMenu(textarea, { clientX: 100, clientY: 100 })
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('long-press ≥500ms on touch opens menu (CTX-02, D-02)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = getByText('hello')
    fireEvent.pointerDown(row, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    clockAdvance(500)
    expect(document.querySelector('[role="menu"]')).toBeTruthy()
  })

  it('long-press <500ms does NOT open menu (D-02)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = getByText('hello')
    fireEvent.pointerDown(row, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    clockAdvance(400)
    fireEvent.pointerUp(row, { pointerType: 'touch' })
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('long-press cancels if pointer moves >10px (D-02)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = getByText('hello')
    fireEvent.pointerDown(row, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(row, {
      pointerType: 'touch',
      clientX: 115,
      clientY: 100,
    })
    clockAdvance(600)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('long-press tolerates ≤10px movement (D-02)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = getByText('hello')
    fireEvent.pointerDown(row, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(row, {
      pointerType: 'touch',
      clientX: 108,
      clientY: 103,
    })
    clockAdvance(500)
    expect(document.querySelector('[role="menu"]')).toBeTruthy()
  })

  it('pointerType=mouse does NOT trigger long-press (D-04)', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = getByText('hello')
    fireEvent.pointerDown(row, {
      pointerType: 'mouse',
      clientX: 100,
      clientY: 100,
    })
    clockAdvance(600)
    // A pointerdown with pointerType=mouse must NOT have started a long-press
    // timer — the menu should only appear via the onContextMenu path.
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('long-press does NOT open menu while isEditing (D-03)', () => {
    const { getByText, getByRole } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    // Enter edit mode.
    fireEvent.click(getByText('hello'))
    const textarea = getByRole('textbox') as HTMLTextAreaElement
    fireEvent.pointerDown(textarea, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    clockAdvance(500)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('Edit menuitem routes through handleContentClick — dispatches vigil:edit-started (D-19 INTERLOCK)', () => {
    // The trap-test: if an implementer takes the shortcut of setting
    // isEditing=true inline in ContextMenu instead of calling handleContentClick,
    // this spy never fires and the Phase 100 pause gate leaks. The 30s poll
    // would then blow away the user's draft. This test pins D-19.
    const startSpy = vi.fn()
    window.addEventListener('vigil:edit-started', startSpy)
    try {
      const { getByText } = render(
        <ThoughtRow
          thought={baseThought}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onMoveToCategory={vi.fn()}
          onAssignProject={vi.fn()}
          onRetriage={vi.fn()}
          projects={baseProjects}
        />,
      )
      fireEvent.contextMenu(getByText('hello'), { clientX: 250, clientY: 300 })
      const editItem = screen.getByRole('menuitem', { name: /^Edit$/ })
      fireEvent.click(editItem)
      expect(startSpy).toHaveBeenCalledTimes(1)
      const ev = startSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
      expect(ev.detail).toEqual({ id: 42 })
    } finally {
      window.removeEventListener('vigil:edit-started', startSpy)
    }
  })

  it('Re-triage menuitem calls the onRetriage prop with thought.id (CTX-06)', () => {
    const onRetriage = vi.fn()
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={onRetriage}
        projects={baseProjects}
      />,
    )
    fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Re-triage/ }))
    expect(onRetriage).toHaveBeenCalledWith(42)
  })

  it('Delete menuitem calls the onDelete prop with thought.id (CTX-03 trigger side)', () => {
    const onDelete = vi.fn()
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    expect(onDelete).toHaveBeenCalledWith(42)
  })

  it('Move to category picker eventually calls onMoveToCategory(id, cat) (CTX-04)', () => {
    const onMoveToCategory = vi.fn()
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={onMoveToCategory}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    // Mobile-style tap-to-replace works via right-click too (the ContextMenu
    // state machine uses openedVia; ThoughtRow right-click sets openedVia=mouse
    // and the hover-submenu path exposes the same items).
    fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
    const moveItem = screen.getByRole('menuitem', { name: /Move to category/ })
    // Trigger desktop hover to open nested submenu.
    fireEvent.mouseEnter(moveItem)
    // Or tap (mobile replace) — either path must surface a Task menuitem.
    fireEvent.click(moveItem)
    fireEvent.click(screen.getByRole('menuitem', { name: /Task/i }))
    expect(onMoveToCategory).toHaveBeenCalledWith(42, 'task')
  })

  it('Add to project picker eventually calls onAssignProject(id, projectId) (CTX-07)', () => {
    const onAssignProject = vi.fn()
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={onAssignProject}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
    const addItem = screen.getByRole('menuitem', { name: /Add to project/ })
    fireEvent.mouseEnter(addItem)
    fireEvent.click(addItem)
    fireEvent.click(screen.getByRole('menuitem', { name: /Alpha/ }))
    expect(onAssignProject).toHaveBeenCalledWith(42, 1)
  })

  it('row element has -webkit-touch-callout:none applied (iOS Safari Pitfall 1)', () => {
    const { container } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    // The row's outermost element should carry the Tailwind arbitrary-prop
    // form so long-press on iOS doesn't trigger the native "Copy | Look Up"
    // callout.
    const row = container.firstElementChild as HTMLElement
    const hasCallout =
      /\[-webkit-touch-callout:none\]/.test(row.className) ||
      (row.style as unknown as Record<string, string>)['webkitTouchCallout'] ===
        'none'
    expect(hasCallout).toBe(true)
  })

  it('row element has touch-action: manipulation (Pitfall 9)', () => {
    const { container } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toMatch(/touch-manipulation/)
  })

  it('only one menu can be open per row at a time — re-right-click replaces not stacks', () => {
    const { getByText } = render(
      <ThoughtRow
        thought={baseThought}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onRetriage={vi.fn()}
        projects={baseProjects}
      />,
    )
    fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
    fireEvent.contextMenu(getByText('hello'), { clientX: 200, clientY: 200 })
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1)
  })
})
