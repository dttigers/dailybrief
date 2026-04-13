import type { ThoughtApiResponse } from '../api/client'

const CATEGORY_COLORS: Record<string, string> = {
  task: 'bg-info-50 text-info-400',
  therapy: 'bg-teal-50 text-teal-600',
  idea: 'bg-warning-50 text-warning-400',
  reflection: 'bg-success-50 text-success-400',
  project: 'bg-teal-50 text-teal-400',
}

const SOURCE_LABELS: Record<string, string> = {
  text: 'text',
  voice: 'voice',
  image: 'image',
}

interface ThoughtAssignmentRowProps {
  thought: ThoughtApiResponse
  onUnassign: (thoughtId: number) => void
}

export default function ThoughtAssignmentRow({ thought, onUnassign }: ThoughtAssignmentRowProps) {
  const categoryColor = thought.category
    ? (CATEGORY_COLORS[thought.category] ?? 'bg-gray-50 text-gray-400')
    : 'bg-gray-50 text-gray-400'

  const sourceLabel = SOURCE_LABELS[thought.source] ?? thought.source

  return (
    <div className="px-3 py-2 flex items-start gap-3 text-sm border-t border-gray-900/40">
      <div className="flex-1 min-w-0">
        <p className="text-gray-100 line-clamp-2 leading-snug">{thought.content}</p>
        <div className="flex items-center gap-2 mt-1">
          {thought.category && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${categoryColor}`}>
              {thought.category}
            </span>
          )}
          <span className="text-xs text-gray-400">{sourceLabel}</span>
        </div>
      </div>
      <button
        onClick={() => onUnassign(thought.id)}
        className="text-xs text-red-400 hover:text-red-300 shrink-0 mt-0.5"
      >
        Unassign
      </button>
    </div>
  )
}
