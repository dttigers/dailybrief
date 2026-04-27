import { useEffect, useRef, useState } from 'react'
import type { ThoughtApiResponse, ProjectApiResponse } from '../api/client'
import ContextMenu from './ContextMenu'

interface ThoughtRowProps {
  thought: ThoughtApiResponse
  onUpdate: (
    id: number,
    patch: { content?: string; category?: string; taskStatus?: string },
  ) => void | Promise<void>
  onToggleFavorite?: (id: number, isFavorited: boolean) => void
  onRetriage?: (id: number) => void
  onChat?: () => void
  isSelectable?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: number) => void
  // Phase 101 context-menu props (all optional so Phase 100 tests continue to
  // render without them).
  onDelete?: (id: number) => void
  onMoveToCategory?: (id: number, category: string) => void
  onAssignProject?: (id: number, projectId: number) => void
  projects?: ProjectApiResponse[]
  isMenuOpen?: boolean
  onOpenMenu?: (id: number) => void
  onCloseMenu?: () => void
}

// Phase 101 D-02 long-press constants.
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

const TASK_STATUS_CYCLE = ['open', 'inProgress', 'done'] as const
const TASK_STATUS_LABELS: Record<string, string> = {
  open: 'To Do',
  inProgress: 'In Progress',
  done: 'Done',
}
const TASK_STATUS_STYLES: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  inProgress: 'bg-info-50 text-info-400 hover:bg-info-50/80',
  done: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
}

const THERAPY_STYLES: Record<string, { label: string; style: string }> = {
  selfLearnable: { label: 'Self-work', style: 'bg-teal-500/20 text-teal-400' },
  bringToTherapist: { label: 'For therapy', style: 'bg-rose-500/20 text-rose-400' },
}

const CATEGORY_STYLES: Record<string, string> = {
  task: 'bg-info-50 text-info-400',
  therapy: 'bg-teal-50 text-teal-600',
  idea: 'bg-warning-50 text-warning-400',
  reflection: 'bg-success-50 text-success-400',
  project: 'bg-teal-50 text-teal-400',
}

function relativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(isoString).toLocaleDateString()
}

export default function ThoughtRow({
  thought,
  onUpdate,
  onToggleFavorite,
  onRetriage,
  onChat,
  isSelectable,
  isSelected,
  onToggleSelect,
  // Phase 101 context-menu props
  onDelete,
  onMoveToCategory,
  onAssignProject,
  projects,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
}: ThoughtRowProps) {
  const [isTriaging, setIsTriaging] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(thought.content)
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Phase 101: context-menu local state. Anchor + openedVia are local because
  // they're only meaningful while this row's menu is open; open-state itself is
  // lifted to the parent (ThoughtList) via isMenuOpen/onOpenMenu/onCloseMenu so
  // only one row across the whole list can own the menu at a time (Pitfall 8).
  //
  // When the parent does NOT provide open-state management (e.g. standalone
  // ThoughtRow renders in unit tests), we fall back to anchor-presence as the
  // open signal. If a parent IS managing it, we require both isMenuOpen===true
  // and a local anchor (the parent may toggle isMenuOpen to close us).
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [openedVia, setOpenedVia] = useState<'mouse' | 'touch'>('mouse')
  const parentManagesOpenState = onOpenMenu !== undefined
  const isActuallyOpen = parentManagesOpenState
    ? isMenuOpen === true && menuAnchor !== null
    : menuAnchor !== null

  // Phase 101 D-02 long-press infrastructure.
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number; el: HTMLElement } | null>(null)

  // Phase 101 Plan 04 — D-21 focus restoration. The outer row div is the
  // focus target returned to when the context menu closes (Escape or outside
  // click). tabIndex={-1} makes it programmatically focusable without putting
  // it in the tab order for non-keyboard users.
  const rowRef = useRef<HTMLDivElement>(null)

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
  }

  // Select all text when textarea mounts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.select()
    }
  }, [isEditing])

  // Phase 100 / EDIT-01, D-12: unmount during edit (tab close / nav) — dispatch
  // end so the useThoughts pause gate refcount doesn't leak.
  //
  // Implementation note: keep a ref in sync with isEditing so the []-deps
  // cleanup can read the latest value at unmount without re-running the
  // cleanup on every isEditing transition (which would double-dispatch end
  // alongside the explicit handleKeyDown/handleSave dispatches).
  const isEditingRef = useRef(isEditing)
  useEffect(() => {
    isEditingRef.current = isEditing
  }, [isEditing])
  const thoughtIdRef = useRef(thought.id)
  useEffect(() => {
    thoughtIdRef.current = thought.id
  }, [thought.id])
  useEffect(() => {
    return () => {
      if (isEditingRef.current) {
        window.dispatchEvent(
          new CustomEvent('vigil:edit-ended', {
            detail: { id: thoughtIdRef.current },
          }),
        )
      }
    }
  }, [])

  const categoryStyle = thought.category
    ? (CATEGORY_STYLES[thought.category] ?? 'bg-gray-50 text-gray-400')
    : 'bg-gray-50 text-gray-400'
  const categoryLabel = thought.category
    ? thought.category.charAt(0).toUpperCase() + thought.category.slice(1)
    : 'Uncategorized'

  function handleTaskStatusCycle() {
    if (thought.category !== 'task') return
    const current = thought.taskStatus ?? 'open'
    const idx = TASK_STATUS_CYCLE.indexOf(current as typeof TASK_STATUS_CYCLE[number])
    const next = TASK_STATUS_CYCLE[(idx + 1) % TASK_STATUS_CYCLE.length]
    onUpdate(thought.id, { taskStatus: next })
  }

  function handleContentClick() {
    setDraft(thought.content)
    setIsEditing(true)
    // Phase 100 / EDIT-01, D-11: notify useThoughts pause gate
    window.dispatchEvent(
      new CustomEvent('vigil:edit-started', { detail: { id: thought.id } }),
    )
  }

  async function handleSave() {
    const trimmed = draft.trim()

    // No change — just exit editing
    if (trimmed === thought.content) {
      setIsEditing(false)
      // D-11: early-exit path must still pair with the edit-started dispatched on entry
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: thought.id } }),
      )
      return
    }

    // Reject empty content — revert instead
    if (!trimmed) {
      setDraft(thought.content)
      setIsEditing(false)
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: thought.id } }),
      )
      return
    }

    setIsSaving(true)
    try {
      await onUpdate(thought.id, { content: trimmed })
    } catch (err) {
      // WR-02: handleSave is invoked without await from synchronous handlers
      // (onBlur, handleKeyDown). Swallowing + logging prevents unhandled
      // rejection from escaping to window.onunhandledrejection while still
      // surfacing the failure for debugging. The finally block below
      // guarantees the edit session ends and the pause gate is released.
      console.error('[ThoughtRow] save failed', err)
    } finally {
      setIsEditing(false)
      setIsSaving(false)
      // D-11: fire even if onUpdate threw — the edit session is over either way
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: thought.id } }),
      )
    }
  }

  // --- Phase 101: context-menu triggers ----------------------------------
  // D-01: desktop right-click opens menu anchored at pointer; suppresses the
  // browser's native menu via preventDefault.
  // D-03: both right-click and long-press are no-ops while isEditing so the
  //       Phase 100 refresh-pause invariant stays clean.
  function handleContextMenu(e: React.MouseEvent) {
    if (isEditing) return // D-03
    e.preventDefault() // D-01
    setMenuAnchor({ x: e.clientX, y: e.clientY })
    setOpenedVia('mouse')
    onOpenMenu?.(thought.id)
  }

  // D-02 long-press: 500ms with 10px movement tolerance. D-04: touch-only.
  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return // D-04
    if (isEditing) return // D-03
    longPressStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      el: e.currentTarget as HTMLElement,
    }
    longPressTimerRef.current = window.setTimeout(() => {
      const s = longPressStartRef.current
      if (!s) return
      // D-06: mobile anchor = row bottom-left of the triggering element.
      const rect = s.el.getBoundingClientRect()
      setMenuAnchor({ x: rect.left, y: rect.bottom })
      setOpenedVia('touch')
      onOpenMenu?.(thought.id)
      longPressTimerRef.current = null
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const s = longPressStartRef.current
    if (!s || longPressTimerRef.current === null) return
    if (
      Math.abs(e.clientX - s.x) > MOVE_TOLERANCE_PX ||
      Math.abs(e.clientY - s.y) > MOVE_TOLERANCE_PX
    ) {
      cancelLongPress()
    }
  }

  function handlePointerUp() {
    cancelLongPress()
  }

  function handlePointerCancel() {
    cancelLongPress()
  }

  // Cleanup on unmount — prevent pending long-press timer from firing on a
  // torn-down component (T-101-03-07).
  useEffect(() => () => cancelLongPress(), [])

  // If the parent closes the menu via isMenuOpen=false, clear our local anchor
  // too so a stale rect doesn't survive into the next open (Pitfall 8 hygiene).
  useEffect(() => {
    if (isMenuOpen === false) setMenuAnchor(null)
  }, [isMenuOpen])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(thought.content)
      setIsEditing(false)
      // Phase 100 / EDIT-01, D-11: Escape cancels edit — notify pause gate
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id: thought.id } }),
      )
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
    // Plain Enter: allow newline in textarea (do nothing)
  }

  return (
    <div
      ref={rowRef}
      tabIndex={-1}
      className={`p-4 border-b border-gray-700/50 hover:bg-gray-900/50 transition-colors [-webkit-touch-callout:none] touch-manipulation select-none focus:outline-none${isSelectable && isSelected ? ' border-l-2 border-l-teal-600' : ''}`}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        {isSelectable && (
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onToggleSelect?.(thought.id)}
            className="w-5 h-5 rounded border-gray-400/30 bg-gray-900/80 accent-teal-600 shrink-0 cursor-pointer mt-0.5"
          />
        )}
        <span className="flex items-center gap-1.5">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryStyle}`}>
            {categoryLabel}
          </span>
          {thought.category === 'task' && (
            <button
              onClick={handleTaskStatusCycle}
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${TASK_STATUS_STYLES[thought.taskStatus ?? 'open'] ?? TASK_STATUS_STYLES.open}`}
            >
              {TASK_STATUS_LABELS[thought.taskStatus ?? 'open'] ?? 'To Do'}
            </button>
          )}
          {thought.therapyClassification && THERAPY_STYLES[thought.therapyClassification] && (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${THERAPY_STYLES[thought.therapyClassification].style}`}>
              {THERAPY_STYLES[thought.therapyClassification].label}
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400 shrink-0 flex items-center gap-2">
          {isSaving && <span className="text-gray-400 text-xs">Saving...</span>}
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(thought.id, !thought.isFavorited)}
              className={`text-base leading-none cursor-pointer transition-colors ${
                thought.isFavorited ? 'text-red-400' : 'text-gray-400/50 hover:text-red-400'
              }`}
              title={thought.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {thought.isFavorited ? '♥' : '♡'}
            </button>
          )}
          {onRetriage && (
            <button
              onClick={async () => {
                setIsTriaging(true)
                try { await onRetriage(thought.id) } finally { setIsTriaging(false) }
              }}
              disabled={isTriaging}
              className="text-gray-400/50 hover:text-teal-400 transition-colors cursor-pointer disabled:opacity-40"
              title="Re-triage with AI"
            >
              {isTriaging ? '...' : '↻'}
            </button>
          )}
          {onChat && (
            <button
              onClick={onChat}
              className="text-gray-400/50 hover:text-teal-400 transition-colors cursor-pointer"
              title="Chat about this thought"
            >
              💬
            </button>
          )}
          {relativeTime(thought.createdAt)}
        </span>
      </div>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full bg-gray-900/80 border border-teal-600 rounded-lg p-2 text-gray-50 focus:outline-none resize-y min-h-[4rem]"
          autoFocus
        />
      ) : (
        <p
          onClick={handleContentClick}
          className="text-gray-100 text-sm leading-relaxed line-clamp-3 break-words cursor-text whitespace-pre-line"
        >
          {thought.content}
        </p>
      )}
      {isActuallyOpen && menuAnchor && (
        <ContextMenu
          anchor={menuAnchor}
          thought={thought}
          projects={projects ?? []}
          openedVia={openedVia}
          onClose={() => {
            setMenuAnchor(null)
            onCloseMenu?.()
            // Plan 04 D-21: return focus to the triggering row. Defer one frame
            // so React has unmounted the ContextMenu portal and released its
            // active menuitem before we re-focus — calling rowRef.focus()
            // synchronously can be overridden when the unmount handler fires.
            // Skip if focus has already landed inside the row (e.g., the Edit
            // menu item mounted a focused textarea) — stealing it back would
            // blur the input and trigger handleSave → vigil:edit-ended,
            // collapsing the edit before the user can type.
            requestAnimationFrame(() => {
              const active = document.activeElement
              if (
                active &&
                active !== document.body &&
                rowRef.current?.contains(active) &&
                active !== rowRef.current
              ) {
                return
              }
              rowRef.current?.focus()
            })
          }}
          // D-19 INTERLOCK: Edit routes through the existing Phase 100 edit-entry
          // function so the vigil:edit-started dispatch + pause-gate stay in sync.
          // Do NOT inline setIsEditing(true) here — the Wave 0 trap-test fails if
          // the dispatch is skipped.
          onStartEdit={handleContentClick}
          onRetriage={(id) => onRetriage?.(id)}
          onMoveToCategory={(id, c) => onMoveToCategory?.(id, c)}
          onAssignProject={(id, pid) => onAssignProject?.(id, pid)}
          onDelete={(id) => onDelete?.(id)}
        />
      )}
    </div>
  )
}
