import type { WorkOrderApiResponse } from '../api/client'

interface WorkOrderRowProps {
  workOrder: WorkOrderApiResponse
  priorityRank: number | null
  onStatusChange: (caseNumber: string, status: string) => void
}

const STATUS_CYCLE = ['open', 'inProgress', 'done'] as const
const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  inProgress: 'In Progress',
  done: 'Done',
}
const STATUS_STYLES: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  inProgress: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  done: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
}

export default function WorkOrderRow({ workOrder, priorityRank, onStatusChange }: WorkOrderRowProps) {
  const isDone = workOrder.status === 'done'

  function handleStatusCycle() {
    const current = workOrder.status as typeof STATUS_CYCLE[number]
    const idx = STATUS_CYCLE.indexOf(current)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange(workOrder.caseNumber, next)
  }

  return (
    <div
      className={`p-4 border-b border-slate-800 hover:bg-slate-900/50 transition-colors ${isDone ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <span className="flex items-center gap-1.5 flex-wrap">
          {priorityRank !== null && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 shrink-0">
              #{priorityRank}
            </span>
          )}
          <span className="text-sm font-mono text-slate-400 shrink-0">
            {workOrder.caseNumber}
          </span>
          {workOrder.state && (
            <span className="text-xs text-slate-500">
              {workOrder.state}
            </span>
          )}
        </span>
        <button
          onClick={handleStatusCycle}
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${STATUS_STYLES[workOrder.status] ?? STATUS_STYLES.open}`}
        >
          {STATUS_LABELS[workOrder.status] ?? 'Open'}
        </button>
      </div>
      <p className="text-slate-100 text-sm font-medium leading-snug mb-1">
        {workOrder.shortDescription}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {workOrder.store && <span>{workOrder.store}</span>}
        {workOrder.trade && <span>{workOrder.trade}</span>}
        {workOrder.location && <span>{workOrder.location}</span>}
      </div>
    </div>
  )
}
