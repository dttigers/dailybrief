import type { ThoughtApiResponse } from '../api/client'

const CATEGORY_COLORS: Record<string, string> = {
  task: 'bg-blue-900 text-blue-300',
  therapy: 'bg-purple-900 text-purple-300',
  idea: 'bg-amber-900 text-amber-300',
  reflection: 'bg-green-900 text-green-300',
  project: 'bg-indigo-900 text-indigo-300',
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
    ? (CATEGORY_COLORS[thought.category] ?? 'bg-slate-700 text-slate-300')
    : 'bg-slate-700 text-slate-300'

  const sourceLabel = SOURCE_LABELS[thought.source] ?? thought.source

  return (
    <div className="px-3 py-2 flex items-start gap-3 text-sm border-t border-slate-800/60">
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 line-clamp-2 leading-snug">{thought.content}</p>
        <div className="flex items-center gap-2 mt-1">
          {thought.category && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${categoryColor}`}>
              {thought.category}
            </span>
          )}
          <span className="text-xs text-slate-500">{sourceLabel}</span>
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
