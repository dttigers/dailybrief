import type { ThoughtApiResponse } from '../api/client'
import ThoughtRow from './ThoughtRow'

interface ThoughtListProps {
  thoughts: ThoughtApiResponse[]
  total: number
  isLoading: boolean
  error: string | null
  onUpdate: (id: number, patch: { content?: string; category?: string }) => void
}

export default function ThoughtList({ thoughts, total, isLoading, error, onUpdate }: ThoughtListProps) {
  if (isLoading) {
    return (
      <div className="text-slate-500 text-center py-12">
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
    return (
      <div className="text-slate-500 text-center py-12">
        No thoughts found
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-lg border border-slate-800 overflow-hidden">
        {thoughts.map((thought) => (
          <ThoughtRow key={thought.id} thought={thought} onUpdate={onUpdate} />
        ))}
      </div>
      {total > thoughts.length && (
        <p className="text-slate-500 text-sm text-center py-4">
          Showing {thoughts.length} of {total} thoughts
        </p>
      )}
    </div>
  )
}
