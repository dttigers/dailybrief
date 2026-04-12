import { useEffect, useRef, useState } from 'react'
import type { ThoughtApiResponse } from '../api/client'

interface ThoughtRowProps {
  thought: ThoughtApiResponse
  onUpdate: (id: number, patch: { content?: string; category?: string; taskStatus?: string }) => void
  onToggleFavorite?: (id: number, isFavorited: boolean) => void
  isSelectable?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: number) => void
}

const TASK_STATUS_CYCLE = ['open', 'inProgress', 'done'] as const
const TASK_STATUS_LABELS: Record<string, string> = {
  open: 'To Do',
  inProgress: 'In Progress',
  done: 'Done',
}
const TASK_STATUS_STYLES: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  inProgress: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  done: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
}

const THERAPY_STYLES: Record<string, { label: string; style: string }> = {
  selfLearnable: { label: 'Self-work', style: 'bg-teal-500/20 text-teal-400' },
  bringToTherapist: { label: 'For therapy', style: 'bg-rose-500/20 text-rose-400' },
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

export default function ThoughtRow({ thought, onUpdate, onToggleFavorite, isSelectable, isSelected, onToggleSelect }: ThoughtRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(thought.content)
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Select all text when textarea mounts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.select()
    }
  }, [isEditing])

  const categoryStyle = thought.category
    ? (CATEGORY_STYLES[thought.category] ?? 'bg-slate-700 text-slate-400')
    : 'bg-slate-700 text-slate-400'
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
  }

  async function handleSave() {
    const trimmed = draft.trim()

    // No change — just exit editing
    if (trimmed === thought.content) {
      setIsEditing(false)
      return
    }

    // Reject empty content — revert instead
    if (!trimmed) {
      setDraft(thought.content)
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      await onUpdate(thought.id, { content: trimmed })
    } finally {
      setIsEditing(false)
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(thought.content)
      setIsEditing(false)
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
    // Plain Enter: allow newline in textarea (do nothing)
  }

  return (
    <div className={`p-4 border-b border-slate-800 hover:bg-slate-900/50 transition-colors${isSelectable && isSelected ? ' border-l-2 border-l-indigo-500' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        {isSelectable && (
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onToggleSelect?.(thought.id)}
            className="w-5 h-5 rounded border-slate-600 bg-slate-800 accent-indigo-500 shrink-0 cursor-pointer mt-0.5"
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
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${THERAPY_STYLES[thought.therapyClassification].style}`}>
              {THERAPY_STYLES[thought.therapyClassification].label}
            </span>
          )}
        </span>
        <span className="text-xs text-slate-500 shrink-0 flex items-center gap-2">
          {isSaving && <span className="text-slate-500 text-xs">Saving...</span>}
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(thought.id, !thought.isFavorited)}
              className={`text-base leading-none cursor-pointer transition-colors ${
                thought.isFavorited ? 'text-red-400' : 'text-slate-600 hover:text-red-400'
              }`}
              title={thought.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {thought.isFavorited ? '♥' : '♡'}
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
          className="w-full bg-slate-800 border border-indigo-500 rounded-lg p-2 text-slate-100 focus:outline-none resize-y min-h-[4rem]"
          autoFocus
        />
      ) : (
        <p
          onClick={handleContentClick}
          className="text-slate-200 text-sm leading-relaxed line-clamp-3 break-words cursor-text"
        >
          {thought.content}
        </p>
      )}
    </div>
  )
}
