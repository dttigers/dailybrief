import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ThoughtApiResponse, ProjectApiResponse } from '../api/client'
import { CATEGORIES } from '../constants/categories'

/**
 * ContextMenu — portaled floating popover for per-thought-row actions.
 *
 * Contract (Phase 101 Plan 02):
 *   - 5 root menu items in locked order: Edit, Re-triage, Move to category →,
 *     Add to project →, Delete (D-09, D-10).
 *   - Close semantics (D-07): Escape, outside pointerdown, window scroll (capture),
 *     window resize, any menuitem selection.
 *   - Positioning (D-08): viewport-overflow flip above / shift left.
 *   - Submenu (D-11 desktop / D-12 mobile): hover-open right-side on mouse,
 *     inline-replace-with-back-header on touch.
 *   - Alphabetical order + current-selection checkmark (D-13, D-14).
 *
 * Phase 100 interlock (D-19): Edit menuitem routes through props.onStartEdit which
 * is the parent's handleContentClick reference — ContextMenu MUST NOT call the
 * edit-state setter or dispatch the edit-started window event itself. See
 * 101-02-PLAN.md acceptance grep guards.
 */

export interface ContextMenuProps {
  anchor: { x: number; y: number }
  thought: ThoughtApiResponse
  projects: ProjectApiResponse[]
  openedVia: 'mouse' | 'touch'
  onClose: () => void
  onStartEdit: () => void
  onRetriage: (id: number) => void
  onMoveToCategory: (id: number, category: string) => void
  onAssignProject: (id: number, projectId: number) => void
  onDelete: (id: number) => void
}

type View = 'root' | 'categories' | 'projects'

// Alphabetically-sorted categories for the submenu (D-13). The CATEGORIES
// source tuple preserves historical BulkActionBar order; the menu sorts for
// scanability.
const ALPHABETICAL_CATEGORIES: readonly string[] = [...CATEGORIES].sort()

// Fallback dimensions used when jsdom / layout-unaware environments report
// rect = {width:0, height:0}. 192px matches min-w-48; 200px is the approx
// height of the 5-item root menu at min-h-11 rows.
const ESTIMATED_MENU_WIDTH = 192
const ESTIMATED_MENU_HEIGHT = 200
const VIEWPORT_PADDING = 8

// Desktop submenu horizontal offset from the right edge of the root menu.
const SUBMENU_GAP = 4

const ROOT_ITEM_CLASSES =
  'w-full text-left px-4 min-h-11 text-sm font-medium text-gray-50 cursor-pointer hover:bg-gray-400/30 transition-colors flex items-center justify-between'
const SUBMENU_ITEM_CLASSES =
  'w-full text-left px-4 min-h-11 text-sm font-normal text-gray-50 cursor-pointer hover:bg-gray-400/30 transition-colors flex items-center justify-between capitalize'
const BACK_HEADER_CLASSES =
  'w-full text-left px-4 min-h-11 text-xs font-medium text-gray-400 cursor-pointer hover:bg-gray-400/30 transition-colors flex items-center'
const DELETE_ITEM_CLASSES =
  'w-full text-left px-4 min-h-11 text-sm font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors flex items-center'

const ROOT_SURFACE_CLASSES =
  'fixed z-50 min-w-48 max-w-[280px] bg-gray-900/80 border border-gray-400/30 rounded-lg shadow-xl py-1'
const DESKTOP_SUBMENU_SURFACE_CLASSES =
  'fixed z-50 min-w-48 max-w-[280px] bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1'

export default function ContextMenu(props: ContextMenuProps) {
  const {
    anchor,
    thought,
    projects,
    openedVia,
    onClose,
    onStartEdit,
    onRetriage,
    onMoveToCategory,
    onAssignProject,
    onDelete,
  } = props

  const [view, setView] = useState<View>('root')
  const [desktopSubmenu, setDesktopSubmenu] = useState<'categories' | 'projects' | null>(null)
  const [adjusted, setAdjusted] = useState(anchor)
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)

  // Plan 04 — D-21 keyboard navigation. focusedIndex tracks the active
  // menuitem position within the current view; itemRefs collects the live
  // button nodes so we can call .focus() when the index changes. Array is
  // cleared on every view swap (mobile inline-replace re-mounts the items).
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Alphabetically-sorted projects (D-13). Re-computed only when the projects
  // array identity changes.
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  )

  // Count of actionable menuitems in the current view. Drives ArrowUp/Down
  // wraparound. Back-header button is NOT role="menuitem" so it's excluded.
  const visibleItemCount = useMemo(() => {
    if (view === 'categories') return ALPHABETICAL_CATEGORIES.length
    if (view === 'projects') return sortedProjects.length
    return 5 // root: Edit, Re-triage, Move, Add-to-project, Delete
  }, [view, sortedProjects.length])

  // D-08: viewport-overflow positioning. Runs AFTER mount so we can measure.
  // Falls back to estimated dims when the environment (jsdom) reports rect=0.
  useLayoutEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = menuRef.current?.getBoundingClientRect()
    const width = rect && rect.width > 0 ? rect.width : ESTIMATED_MENU_WIDTH
    const height = rect && rect.height > 0 ? rect.height : ESTIMATED_MENU_HEIGHT

    let x = anchor.x
    let y = anchor.y

    if (x + width > vw - VIEWPORT_PADDING) {
      x = Math.max(VIEWPORT_PADDING, vw - width - VIEWPORT_PADDING)
    }
    if (y + height > vh - VIEWPORT_PADDING) {
      // Flip above the anchor.
      y = Math.max(VIEWPORT_PADDING, anchor.y - height)
    }

    setAdjusted({ x, y })
    // Re-measure when anchor or view changes (view change may resize menu
    // when the mobile inline-replace swaps contents).
  }, [anchor.x, anchor.y, view])

  // Compute desktop submenu position whenever it opens. Anchored to the
  // right edge of the root menu with a small gap (D-11).
  useLayoutEffect(() => {
    if (openedVia !== 'mouse' || !desktopSubmenu) {
      setSubmenuPos(null)
      return
    }
    const rootRect = menuRef.current?.getBoundingClientRect()
    if (!rootRect) return
    const rootRight = rootRect.right > 0 ? rootRect.right : adjusted.x + ESTIMATED_MENU_WIDTH
    const rootTop = rootRect.top > 0 ? rootRect.top : adjusted.y
    setSubmenuPos({ left: rootRight + SUBMENU_GAP, top: rootTop })
  }, [openedVia, desktopSubmenu, adjusted.x, adjusted.y])

  // Plan 04 — D-21 keyboard a11y. Reset focus to the first item whenever the
  // view swaps (root ↔ categories ↔ projects under mobile inline-replace).
  // Clearing the refs array here avoids stale button pointers when the render
  // tree shrinks between views (e.g. 5 categories → 0 projects empty state).
  // Runs before paint via useLayoutEffect so the subsequent focus effect
  // doesn't race with the stale refs array from the previous view.
  useLayoutEffect(() => {
    setFocusedIndex(0)
    itemRefs.current = []
  }, [view])

  // Apply focus whenever the focused index changes or the view re-renders.
  // useLayoutEffect (not useEffect) so the focus lands synchronously after the
  // DOM update — this matters for the initial mount where tests assert
  // document.activeElement immediately after render, and also for Escape
  // close-handlers that want to restore focus before React's next paint.
  useLayoutEffect(() => {
    const target = itemRefs.current[focusedIndex]
    if (target) target.focus()
  }, [focusedIndex, view])

  // D-07 + Plan 04 D-21: Escape close, outside pointerdown, scroll, resize,
  // and keyboard navigation (ArrowUp/Down, Enter, ArrowRight/Left).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (visibleItemCount > 0) {
          setFocusedIndex((i) => (i + 1) % visibleItemCount)
        }
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (visibleItemCount > 0) {
          setFocusedIndex((i) => (i - 1 + visibleItemCount) % visibleItemCount)
        }
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        itemRefs.current[focusedIndex]?.click()
        return
      }
      if (e.key === 'ArrowRight' && view === 'root') {
        // Open submenu for Move-to-category (index 2) or Add-to-project (index 3).
        if (focusedIndex === 2) {
          e.preventDefault()
          if (openedVia === 'touch') setView('categories')
          else setDesktopSubmenu('categories')
        } else if (focusedIndex === 3) {
          e.preventDefault()
          if (openedVia === 'touch') setView('projects')
          else setDesktopSubmenu('projects')
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        if (view === 'categories' || view === 'projects') {
          e.preventDefault()
          setView('root')
        } else if (desktopSubmenu !== null) {
          e.preventDefault()
          setDesktopSubmenu(null)
        }
        return
      }
    }
    const onScroll = () => onClose()
    const onResize = () => onClose()
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      const inRoot = menuRef.current?.contains(target) ?? false
      const inSubmenu = submenuRef.current?.contains(target) ?? false
      if (!inRoot && !inSubmenu) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Capture-phase scroll so nested scroll containers also close us (Pattern 4).
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    // pointerdown (NOT click) — Pitfall 5.
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, view, focusedIndex, openedVia, desktopSubmenu, visibleItemCount])

  // --- Action handlers ------------------------------------------------------

  const handleEdit = useCallback(() => {
    onStartEdit()
    onClose()
  }, [onStartEdit, onClose])

  const handleRetriage = useCallback(() => {
    onRetriage(thought.id)
    onClose()
  }, [onRetriage, thought.id, onClose])

  const handleMoveCategory = useCallback(
    (cat: string) => {
      onMoveToCategory(thought.id, cat)
      onClose()
    },
    [onMoveToCategory, thought.id, onClose],
  )

  const handleAssignProject = useCallback(
    (projectId: number) => {
      onAssignProject(thought.id, projectId)
      onClose()
    },
    [onAssignProject, thought.id, onClose],
  )

  const handleDelete = useCallback(() => {
    onDelete(thought.id)
    onClose()
  }, [onDelete, thought.id, onClose])

  // Desktop hover handlers — open submenu on root-item hover.
  const handleMoveHover = useCallback(() => {
    if (openedVia === 'mouse') setDesktopSubmenu('categories')
  }, [openedVia])

  const handleAssignHover = useCallback(() => {
    if (openedVia === 'mouse') setDesktopSubmenu('projects')
  }, [openedVia])

  // Mobile tap — replace root contents with submenu view (D-12).
  const handleMoveTap = useCallback(() => {
    if (openedVia === 'touch') setView('categories')
  }, [openedVia])

  const handleAssignTap = useCallback(() => {
    if (openedVia === 'touch') setView('projects')
  }, [openedVia])

  const closeDesktopSubmenu = useCallback(() => {
    if (openedVia === 'mouse') setDesktopSubmenu(null)
  }, [openedVia])

  // --- Renderers ------------------------------------------------------------

  // Plan 04 — focus-ring accent token from UI-SPEC (teal-600 at 40% opacity,
  // the accent-reserved ring color for keyboard-focused menu items).
  const FOCUS_RING = 'ring-2 ring-teal-600/40'

  // Registers a button ref at a given index and applies the focus ring when
  // the index matches the current focusedIndex. Keeps the per-button JSX
  // compact while keeping the a11y plumbing explicit. The ref callback also
  // eagerly calls .focus() when the newly-mounted element matches the active
  // focusedIndex — this covers the initial-mount case where the
  // useLayoutEffect-driven focus apply runs before the portal children have
  // been attached to document.body.
  function registerItem(
    index: number,
    baseClasses: string,
  ): {
    ref: (el: HTMLButtonElement | null) => void
    tabIndex: number
    onFocus: () => void
    className: string
  } {
    return {
      ref: (el) => {
        itemRefs.current[index] = el
        if (el && focusedIndex === index && document.activeElement !== el) {
          el.focus()
        }
      },
      tabIndex: focusedIndex === index ? 0 : -1,
      onFocus: () => setFocusedIndex(index),
      className: `${baseClasses}${focusedIndex === index ? ` ${FOCUS_RING}` : ''}`,
    }
  }

  function renderCategoryList(inSubmenu: boolean) {
    const itemClasses = inSubmenu ? SUBMENU_ITEM_CLASSES : ROOT_ITEM_CLASSES
    return ALPHABETICAL_CATEGORIES.map((cat, i) => {
      const isCurrent = thought.category === cat
      const reg = registerItem(i, itemClasses)
      return (
        <button
          key={cat}
          type="button"
          role="menuitem"
          data-current={isCurrent ? 'true' : undefined}
          onClick={() => handleMoveCategory(cat)}
          ref={reg.ref}
          tabIndex={reg.tabIndex}
          onFocus={reg.onFocus}
          className={reg.className}
        >
          <span>{cat}</span>
          {isCurrent && <span className="text-teal-400" aria-hidden="true">✓</span>}
        </button>
      )
    })
  }

  function renderProjectList(inSubmenu: boolean) {
    if (sortedProjects.length === 0) {
      return (
        <p className="text-sm text-gray-400 text-center px-4 py-2">
          No projects yet. Create one on the Projects tab.
        </p>
      )
    }
    const itemClasses = inSubmenu ? SUBMENU_ITEM_CLASSES : ROOT_ITEM_CLASSES
    return sortedProjects.map((p, i) => {
      const isCurrent = thought.projectId === p.id
      const reg = registerItem(i, itemClasses)
      return (
        <button
          key={p.id}
          type="button"
          role="menuitem"
          data-current={isCurrent ? 'true' : undefined}
          onClick={() => handleAssignProject(p.id)}
          ref={reg.ref}
          tabIndex={reg.tabIndex}
          onFocus={reg.onFocus}
          className={reg.className}
        >
          <span>{p.name}</span>
          {isCurrent && <span className="text-teal-400" aria-hidden="true">✓</span>}
        </button>
      )
    })
  }

  function renderRoot() {
    const editReg = registerItem(0, ROOT_ITEM_CLASSES)
    const retriageReg = registerItem(1, ROOT_ITEM_CLASSES)
    const moveReg = registerItem(2, ROOT_ITEM_CLASSES)
    const addReg = registerItem(3, ROOT_ITEM_CLASSES)
    const deleteReg = registerItem(4, DELETE_ITEM_CLASSES)
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={handleEdit}
          onMouseEnter={closeDesktopSubmenu}
          ref={editReg.ref}
          tabIndex={editReg.tabIndex}
          onFocus={editReg.onFocus}
          className={editReg.className}
        >
          <span>Edit</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={handleRetriage}
          onMouseEnter={closeDesktopSubmenu}
          ref={retriageReg.ref}
          tabIndex={retriageReg.tabIndex}
          onFocus={retriageReg.onFocus}
          className={retriageReg.className}
        >
          <span>Re-triage</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={handleMoveTap}
          onMouseEnter={handleMoveHover}
          ref={moveReg.ref}
          tabIndex={moveReg.tabIndex}
          onFocus={moveReg.onFocus}
          className={moveReg.className}
          aria-haspopup="menu"
        >
          <span>Move to category</span>
          <span className="text-gray-400 ml-2" aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={handleAssignTap}
          onMouseEnter={handleAssignHover}
          ref={addReg.ref}
          tabIndex={addReg.tabIndex}
          onFocus={addReg.onFocus}
          className={addReg.className}
          aria-haspopup="menu"
        >
          <span>Add to project</span>
          <span className="text-gray-400 ml-2" aria-hidden="true">→</span>
        </button>
        <div className="border-t border-gray-700 my-1" aria-hidden="true" />
        <button
          type="button"
          role="menuitem"
          onClick={handleDelete}
          onMouseEnter={closeDesktopSubmenu}
          ref={deleteReg.ref}
          tabIndex={deleteReg.tabIndex}
          onFocus={deleteReg.onFocus}
          className={deleteReg.className}
        >
          <span>Delete</span>
        </button>
      </>
    )
  }

  function renderMobileCategoriesView() {
    return (
      <>
        <button
          type="button"
          onClick={() => setView('root')}
          className={BACK_HEADER_CLASSES}
        >
          ← Categories
        </button>
        {renderCategoryList(false)}
      </>
    )
  }

  function renderMobileProjectsView() {
    return (
      <>
        <button
          type="button"
          onClick={() => setView('root')}
          className={BACK_HEADER_CLASSES}
        >
          ← Projects
        </button>
        {renderProjectList(false)}
      </>
    )
  }

  // --- Render ---------------------------------------------------------------

  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        className={ROOT_SURFACE_CLASSES}
        style={{ left: `${adjusted.x}px`, top: `${adjusted.y}px` }}
      >
        {view === 'root' && renderRoot()}
        {view === 'categories' && renderMobileCategoriesView()}
        {view === 'projects' && renderMobileProjectsView()}
      </div>
      {openedVia === 'mouse' && desktopSubmenu && submenuPos && (
        <div
          ref={submenuRef}
          role="menu"
          className={DESKTOP_SUBMENU_SURFACE_CLASSES}
          style={{ left: `${submenuPos.left}px`, top: `${submenuPos.top}px` }}
          onMouseLeave={() => setDesktopSubmenu(null)}
        >
          {desktopSubmenu === 'categories'
            ? renderCategoryList(true)
            : renderProjectList(true)}
        </div>
      )}
    </>,
    document.body,
  )
}
