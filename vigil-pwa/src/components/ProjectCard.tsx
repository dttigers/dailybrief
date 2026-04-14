import { useState } from 'react'
import type { ProjectApiResponse, ThoughtApiResponse } from '../api/client'
import ThoughtAssignmentRow from './ThoughtAssignmentRow'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900 text-green-300',
  archived: 'bg-gray-50 text-gray-400',
  done: 'bg-info-50 text-info-400',
}

interface ProjectCardProps {
  project: ProjectApiResponse
  thoughts: ThoughtApiResponse[]
  unassignedThoughts: ThoughtApiResponse[]
  onAssign: (thoughtId: number, projectId: number) => void
  onUnassign: (thoughtId: number) => void
}

export default function ProjectCard({
  project,
  thoughts,
  unassignedThoughts,
  onAssign,
  onUnassign,
}: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = project.status
    ? (STATUS_COLORS[project.status] ?? 'bg-gray-50 text-gray-400')
    : null

  function handleAssignChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (!val) return
    onAssign(Number(val), project.id)
    e.target.value = ''
  }

  return (
    <div className="rounded-lg border border-gray-900/40 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-900/80"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-white truncate">{project.name}</span>
          <span className="text-xs bg-gray-400/30 rounded-full px-2 py-0.5 text-gray-100 shrink-0">
            {thoughts.length}
          </span>
          {project.status && statusColor && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${statusColor}`}>
              {project.status}
            </span>
          )}
        </div>
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Description (always visible if present) */}
      {project.description && (
        <p
          className={`px-4 pb-2 text-sm text-gray-400 ${expanded ? '' : 'truncate'}`}
        >
          {project.description}
        </p>
      )}

      {/* Expanded content */}
      {expanded && (
        <div>
          {thoughts.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No thoughts assigned yet.</p>
          ) : (
            <div>
              {thoughts.map((t) => (
                <ThoughtAssignmentRow key={t.id} thought={t} onUnassign={onUnassign} />
              ))}
            </div>
          )}

          {/* Assign dropdown */}
          {unassignedThoughts.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-900/40">
              <label className="block text-xs text-gray-400 mb-1">Assign a thought</label>
              <select
                defaultValue=""
                onChange={handleAssignChange}
                className="w-full bg-gray-900/80 border border-gray-400/30 rounded text-sm text-gray-100 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="" disabled>
                  Select a thought to assign...
                </option>
                {unassignedThoughts.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.content.slice(0, 80)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
