import type { ThoughtApiResponse } from '../api/client'
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
}

export default function ThoughtList({ thoughts, total, isLoading, error, onUpdate, onToggleFavorite, onRetriage, onChat, selectedIds, onToggleSelect, isSelectable, isSearchActive }: ThoughtListProps) {
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
