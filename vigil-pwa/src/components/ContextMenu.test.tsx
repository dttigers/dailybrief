import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import ContextMenu from './ContextMenu'
import { ToastProvider } from '../hooks/useToast'
import type { ThoughtApiResponse, ProjectApiResponse } from '../api/client'

// Baseline fixture — shape matches ThoughtApiResponse. Tests mutate fields as needed.
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

// Helper: always wrap in ToastProvider so useToast calls inside ContextMenu don't throw.
function wrap(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// Preserve/restore viewport for positioning tests.
let originalInnerWidth: number
let originalInnerHeight: number

beforeEach(() => {
  originalInnerWidth = window.innerWidth
  originalInnerHeight = window.innerHeight
})

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    value: originalInnerWidth,
    configurable: true,
  })
  Object.defineProperty(window, 'innerHeight', {
    value: originalInnerHeight,
    configurable: true,
  })
})

describe('ContextMenu — open + position', () => {
  it('renders role="menu" on open', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 100, y: 100 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('applies anchor position as fixed left/top', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 100, y: 100 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const menu = screen.getByRole('menu') as HTMLElement
    expect(menu.style.left).toBe('100px')
    expect(menu.style.top).toBe('100px')
  })

  it('shifts left when right-edge would overflow', () => {
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true })
    wrap(
      <ContextMenu
        anchor={{ x: 280, y: 100 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const menu = screen.getByRole('menu') as HTMLElement
    const left = parseFloat(menu.style.left)
    expect(left).toBeLessThan(280)
  })

  it('flips above when bottom-edge would overflow', () => {
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true })
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 180 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const menu = screen.getByRole('menu') as HTMLElement
    const top = parseFloat(menu.style.top)
    expect(top).toBeLessThan(180)
  })
})

describe('ContextMenu — close behavior (D-07)', () => {
  it('closes on Escape key', () => {
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on outside pointerdown', () => {
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on window scroll (capture)', () => {
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    window.dispatchEvent(new Event('scroll'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on window resize', () => {
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.resize(window)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes after selecting a menu item', () => {
    const onClose = vi.fn()
    const onStartEdit = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={onStartEdit}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /^Edit$/ }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ContextMenu — item order and copy (D-09, D-10, UI-SPEC)', () => {
  it('renders exactly 5 root menu items in order: Edit, Re-triage, Move to category, Add to project, Delete', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBe(5)
    expect(items[0].textContent).toMatch(/Edit/)
    expect(items[1].textContent).toMatch(/Re-triage/)
    expect(items[2].textContent).toMatch(/Move to category/)
    expect(items[3].textContent).toMatch(/Add to project/)
    expect(items[4].textContent).toMatch(/Delete/)
  })

  it('Delete item uses text-red-400 (UI-SPEC Color table)', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const deleteItem = screen.getByRole('menuitem', { name: /Delete/ })
    expect(deleteItem.className).toMatch(/text-red-400/)
  })

  it('Move to category and Add to project items show → arrow glyph', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const moveItem = screen.getByRole('menuitem', { name: /Move to category/ })
    const addItem = screen.getByRole('menuitem', { name: /Add to project/ })
    expect(moveItem.textContent).toContain('→')
    expect(addItem.textContent).toContain('→')
  })
})

describe('ContextMenu — action routing (CTX-03..CTX-07, D-20)', () => {
  it('Edit menuitem calls onStartEdit and closes', () => {
    const onStartEdit = vi.fn()
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={onStartEdit}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /^Edit$/ }))
    expect(onStartEdit).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('Re-triage menuitem calls onRetriage(thought.id) and closes (CTX-06, D-18)', () => {
    const onRetriage = vi.fn()
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={vi.fn()}
        onRetriage={onRetriage}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Re-triage/ }))
    expect(onRetriage).toHaveBeenCalledWith(42)
    expect(onClose).toHaveBeenCalled()
  })

  it('Move to category submenu shows 5 hardcoded categories in alphabetical order', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to category/ }))
    // After mobile tap, submenu items appear. Expect 5 categories alphabetical.
    const items = screen
      .getAllByRole('menuitem')
      .map((n) => (n.textContent ?? '').toLowerCase())
    const expected = ['idea', 'project', 'reflection', 'task', 'therapy']
    // Each expected category should appear in order relative to the others.
    let lastIdx = -1
    for (const cat of expected) {
      const idx = items.findIndex(
        (txt, i) => i > lastIdx && txt.includes(cat),
      )
      expect(idx).toBeGreaterThan(lastIdx)
      lastIdx = idx
    }
  })

  it('Move to category selection calls onMoveToCategory(id, category)', () => {
    const onMoveToCategory = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={onMoveToCategory}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to category/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Task/i }))
    expect(onMoveToCategory).toHaveBeenCalledWith(42, 'task')
  })

  it('Current category is marked with checkmark or (current) suffix (D-14)', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={{ ...baseThought, category: 'idea' }}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to category/ }))
    const ideaItem = screen.getByRole('menuitem', { name: /Idea/i })
    const marked =
      ideaItem.getAttribute('data-current') === 'true' ||
      (ideaItem.textContent ?? '').toLowerCase().includes('(current)') ||
      (ideaItem.textContent ?? '').includes('✓') ||
      ideaItem.querySelector('svg') !== null
    expect(marked).toBe(true)
  })

  it('Re-selecting current category still calls onMoveToCategory (no-op but wired, D-14)', () => {
    const onMoveToCategory = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={{ ...baseThought, category: 'idea' }}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={onMoveToCategory}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to category/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Idea/i }))
    expect(onMoveToCategory).toHaveBeenCalledWith(42, 'idea')
  })

  it('Add to project submenu shows projects sorted alphabetically (D-13)', () => {
    // Pass projects out of alphabetical order to prove the component sorts.
    const unsorted: ProjectApiResponse[] = [
      { id: 2, name: 'Beta', description: null, status: null, createdAt: '', updatedAt: '' },
      { id: 1, name: 'Alpha', description: null, status: null, createdAt: '', updatedAt: '' },
    ]
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={unsorted}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Add to project/ }))
    const items = screen
      .getAllByRole('menuitem')
      .map((n) => n.textContent ?? '')
    const alphaIdx = items.findIndex((t) => t.includes('Alpha'))
    const betaIdx = items.findIndex((t) => t.includes('Beta'))
    expect(alphaIdx).toBeGreaterThanOrEqual(0)
    expect(betaIdx).toBeGreaterThan(alphaIdx)
  })

  it('Add to project selection calls onAssignProject(id, projectId)', () => {
    const onAssignProject = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={onAssignProject}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Add to project/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Alpha/ }))
    expect(onAssignProject).toHaveBeenCalledWith(42, 1)
  })

  it('Add to project empty state shows "No projects yet. Create one on the Projects tab." (UI-SPEC)', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={[]}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Add to project/ }))
    expect(
      screen.getByText(/No projects yet\. Create one on the Projects tab\./),
    ).toBeTruthy()
  })

  it('Delete menuitem calls onDelete(thought.id) and closes (CTX-03)', () => {
    const onDelete = vi.fn()
    const onClose = vi.fn()
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={onClose}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    expect(onDelete).toHaveBeenCalledWith(42)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ContextMenu — submenu layout (D-11, D-12)', () => {
  it('desktop (openedVia=mouse): hovering Move to category opens right-side submenu (not in-place)', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const moveItem = screen.getByRole('menuitem', { name: /Move to category/ })
    fireEvent.mouseEnter(moveItem)
    // Submenu should mount alongside the root menu — look for a category label
    // while the root menu is still present.
    const menus = screen.getAllByRole('menu')
    expect(menus.length).toBeGreaterThanOrEqual(2)
  })

  it('mobile (openedVia=touch): tapping Move to category replaces root contents with ← Categories header', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to category/ }))
    // Root items should be gone — "Re-triage" is a root-only label.
    expect(screen.queryByRole('menuitem', { name: /Re-triage/ })).toBeNull()
    expect(screen.getByText(/←\s*Categories/)).toBeTruthy()
  })

  it('mobile: ← Categories back affordance returns to root', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="touch"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to category/ }))
    // Click the back affordance.
    fireEvent.click(screen.getByText(/←\s*Categories/))
    // Root 5 items should be back.
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBe(5)
  })
})

describe('ContextMenu — a11y (D-21)', () => {
  it('root menu has role="menu"', () => {
    wrap(
      <ContextMenu
        anchor={{ x: 50, y: 50 }}
        thought={baseThought}
        projects={baseProjects}
        openedVia="mouse"
        onClose={vi.fn()}
        onStartEdit={vi.fn()}
        onRetriage={vi.fn()}
        onMoveToCategory={vi.fn()}
        onAssignProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it.skip('TODO Plan 04: ArrowDown moves focus to next menuitem', () => {
    // Wave 3 manual/keyboard gate — implemented in Plan 04 polish pass.
  })

  it.skip('TODO Plan 04: Enter activates focused menuitem', () => {
    // Wave 3 manual/keyboard gate — implemented in Plan 04 polish pass.
  })

  it.skip('TODO Plan 04: Escape returns focus to triggering row', () => {
    // Wave 3 manual/keyboard gate — implemented in Plan 04 polish pass.
  })
})
