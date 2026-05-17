import type { WorkOrderApiResponse } from '../api/client'

interface WorkOrderRowProps {
  workOrder: WorkOrderApiResponse
  priorityRank: number | null
  onStatusChange: (caseNumber: string, status: string) => void
  isArchived?: boolean
  onUnarchive?: () => void
  // Phase 129.1-05 / WO-MANUAL-02 — parent passes this when it hosts the
  // ReviewWorkOrderModal; row renders a "Review draft" button (amber) instead
  // of the status-cycle button when state === 'pending_review'.
  onReview?: (workOrder: WorkOrderApiResponse) => void
}

const STATUS_CYCLE = ['open', 'inProgress', 'done'] as const
const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  inProgress: 'In Progress',
  done: 'Done',
}
const STATUS_STYLES: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  inProgress: 'bg-info-50 text-info-400 hover:bg-info-50/80',
  done: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
  // Phase 129.1-05 — amber draft-review style; row branch below renders
  // the Review draft button instead of cycling status on click.
  pending_review: 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
}

export default function WorkOrderRow({ workOrder, priorityRank, onStatusChange, isArchived, onUnarchive, onReview }: WorkOrderRowProps) {
  const isDone = workOrder.status === 'done'
  // RESEARCH §568 LANDMINE — pending_review rows MUST NOT be cyclable.
  const isPendingReview = workOrder.state === 'pending_review'

  function handleStatusCycle() {
    if (isArchived) return // Archived orders should not cycle status
    const current = workOrder.status as typeof STATUS_CYCLE[number]
    const idx = STATUS_CYCLE.indexOf(current)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange(workOrder.caseNumber, next)
  }

  return (
    <div
      className={`p-4 border-b border-gray-900/40 hover:bg-gray-900/50 transition-colors ${isDone || isArchived ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <span className="flex items-center gap-1.5 flex-wrap">
          {priorityRank !== null && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-600 shrink-0">
              #{priorityRank}
            </span>
          )}
          <span className="text-sm font-mono text-gray-400 shrink-0">
            {workOrder.caseNumber}
          </span>
          {workOrder.state && (
            <span className="text-xs text-gray-400">
              {workOrder.state}
            </span>
          )}
        </span>
        {isArchived ? (
          <button
            onClick={onUnarchive}
            className="border border-teal-600 text-teal-500 hover:bg-teal-600/10 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors shrink-0"
          >
            Unarchive
          </button>
        ) : isPendingReview ? (
          <button
            onClick={() => onReview?.(workOrder)}
            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${STATUS_STYLES.pending_review}`}
          >
            Review draft
          </button>
        ) : (
          <button
            onClick={handleStatusCycle}
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${STATUS_STYLES[workOrder.status] ?? STATUS_STYLES.open}`}
          >
            {STATUS_LABELS[workOrder.status] ?? 'Open'}
          </button>
        )}
      </div>
      <p className="text-gray-50 text-sm font-medium leading-snug mb-1">
        {workOrder.shortDescription}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
        {workOrder.store && <span>{workOrder.store}</span>}
        {workOrder.trade && <span>{workOrder.trade}</span>}
        {workOrder.location && <span>{workOrder.location}</span>}
      </div>
      {workOrder.lastChangeAt && workOrder.lastChangeSummary && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium text-amber-400">Updated</span>
            <span className="text-xs text-gray-400">
              {new Date(workOrder.lastChangeAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-xs text-gray-300">{workOrder.lastChangeSummary}</p>
        </div>
      )}
    </div>
  )
}
