import type { ThoughtApiResponse } from '../api/client'

interface ThoughtRowProps {
  thought: ThoughtApiResponse
  onUpdate: (id: number, patch: { content?: string; category?: string }) => void
}

const CATEGORY_STYLES: Record<string, string> = {
  task: 'bg-blue-500/20 text-blue-400',
  therapy: 'bg-purple-500/20 text-purple-400',
  idea: 'bg-amber-500/20 text-amber-400',
  reflection: 'bg-green-500/20 text-green-400',
  project: 'bg-pink-500/20 text-pink-400',
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

export default function ThoughtRow({ thought, onUpdate: _onUpdate }: ThoughtRowProps) {
  const categoryStyle = thought.category
    ? (CATEGORY_STYLES[thought.category] ?? 'bg-slate-700 text-slate-400')
    : 'bg-slate-700 text-slate-400'
  const categoryLabel = thought.category
    ? thought.category.charAt(0).toUpperCase() + thought.category.slice(1)
    : 'Uncategorized'

  return (
    <div className="p-4 border-b border-slate-800 hover:bg-slate-900/50 transition-colors cursor-pointer">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryStyle}`}>
          {categoryLabel}
        </span>
        <span className="text-xs text-slate-500 shrink-0">{relativeTime(thought.createdAt)}</span>
      </div>
      <p className="text-slate-200 text-sm leading-relaxed line-clamp-3 break-words">
        {thought.content}
      </p>
    </div>
  )
}
