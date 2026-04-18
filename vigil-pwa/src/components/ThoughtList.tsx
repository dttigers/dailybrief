import { useEffect, useState } from 'react'
import type { ThoughtApiResponse, ProjectApiResponse } from '../api/client'
import ThoughtRow from './ThoughtRow'

interface ThoughtListProps {
  thoughts: ThoughtApiResponse[]
  total: number
  isLoading: boolean
  error: string | null
  onUpdate: (
    id: number,
    patch: { content?: string; category?: string; taskStatus?: string },
  ) => void | Promise<void>
  onToggleFavorite?: (id: number, isFavorited: boolean) => void
  onRetriage?: (id: number) => void
  onChat?: (thought: ThoughtApiResponse) => void
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  isSelectable?: boolean
  isSearchActive: boolean
  // Phase 101 — context-menu actions prop-drilled to ThoughtRow (CTX-03/04/07).
  onDelete?: (id: number) => void
  onMoveToCategory?: (id: number, category: string) => void
  onAssignProject?: (id: number, projectId: number) => void
  projects?: ProjectApiResponse[]
}

export default function ThoughtList({ thoughts, total, isLoading, error, onUpdate, onToggleFavorite, onRetriage, onChat, selectedIds, onToggleSelect, isSelectable, isSearchActive, onDelete, onMoveToCategory, onAssignProject, projects }: ThoughtListProps) {
  // Phase 101 (Pitfall 8): lift single-open state so only one ThoughtRow's
  // context menu is mounted at any time across the entire list.
  const [openMenuForId, setOpenMenuForId] = useState<number | null>(null)

  // Auto-close the menu if the currently-open row scrolls out of the result
  // set (filter change, category switch, search query change, pagination).
  useEffect(() => {
    if (openMenuForId !== null && !thoughts.some((t) => t.id === openMenuForId)) {
      setOpenMenuForId(null)
    }
  }, [thoughts, openMenuForId])
  if (isLoading) {
    return (
      <div className="text-gray-400 text-center py-12">
        Loading thoughts...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-400 text-center py-12">
        {error}
      </div>
    )
  }

  if (thoughts.length === 0) {
    if (isSearchActive) {
      return (
        <div className="text-gray-400 text-center py-12">
          No thoughts found
        </div>
      )
    }
    return (
      <div className="text-center py-12 space-y-1">
        <p className="text-gray-400 text-sm">No thoughts this week yet</p>
        <p className="text-gray-400 text-sm">Capture one above to get started.</p>
        <p className="text-gray-400/70 text-xs mt-2">Looking for older thoughts? Search above.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-lg border border-gray-900/40 overflow-hidden">
        {thoughts.map((thought) => (
          <ThoughtRow
            key={thought.id}
            thought={thought}
            onUpdate={onUpdate}
            onToggleFavorite={onToggleFavorite}
            onRetriage={onRetriage}
            onChat={onChat ? () => onChat(thought) : undefined}
            isSelectable={isSelectable}
            isSelected={selectedIds?.has(thought.id)}
            onToggleSelect={onToggleSelect}
            onDelete={onDelete}
            onMoveToCategory={onMoveToCategory}
            onAssignProject={onAssignProject}
            projects={projects}
            isMenuOpen={openMenuForId === thought.id}
            onOpenMenu={(id) => setOpenMenuForId(id)}
            onCloseMenu={() => setOpenMenuForId(null)}
          />
        ))}
      </div>
      {total > thoughts.length && (
        <p className="text-gray-400 text-sm text-center py-4">
          Showing {thoughts.length} of {total} thoughts
        </p>
      )}
    </div>
  )
}
