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

  // Alphabetically-sorted projects (D-13). Re-computed only when the projects
  // array identity changes.
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  )

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

  // D-07: close on Escape, outside pointerdown, scroll, resize.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
  }, [onClose])

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

  function renderCategoryList(inSubmenu: boolean) {
    const itemClasses = inSubmenu ? SUBMENU_ITEM_CLASSES : ROOT_ITEM_CLASSES
    return ALPHABETICAL_CATEGORIES.map((cat) => {
      const isCurrent = thought.category === cat
      return (
        <button
          key={cat}
          type="button"
          role="menuitem"
          data-current={isCurrent ? 'true' : undefined}
          onClick={() => handleMoveCategory(cat)}
          className={itemClasses}
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
    return sortedProjects.map((p) => {
      const isCurrent = thought.projectId === p.id
      return (
        <button
          key={p.id}
          type="button"
          role="menuitem"
          data-current={isCurrent ? 'true' : undefined}
          onClick={() => handleAssignProject(p.id)}
          className={itemClasses}
        >
          <span>{p.name}</span>
          {isCurrent && <span className="text-teal-400" aria-hidden="true">✓</span>}
        </button>
      )
    })
  }

  function renderRoot() {
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={handleEdit}
          onMouseEnter={closeDesktopSubmenu}
          className={ROOT_ITEM_CLASSES}
        >
          <span>Edit</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={handleRetriage}
          onMouseEnter={closeDesktopSubmenu}
          className={ROOT_ITEM_CLASSES}
        >
          <span>Re-triage</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={handleMoveTap}
          onMouseEnter={handleMoveHover}
          className={ROOT_ITEM_CLASSES}
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
          className={ROOT_ITEM_CLASSES}
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
          className={DELETE_ITEM_CLASSES}
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
