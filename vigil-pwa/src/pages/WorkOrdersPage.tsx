import { useState } from 'react'
import { updateWorkOrderStatus } from '../api/client'
import WorkOrderRow from '../components/WorkOrderRow'
import CreateWorkOrderModal from '../components/CreateWorkOrderModal'
import { useWorkOrders, type WorkOrderFilter } from '../hooks/useWorkOrders'

const ARCHIVE_FILTERS: { label: string; value: WorkOrderFilter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
  { label: 'All', value: 'all' },
]

export default function WorkOrdersPage() {
  const [filter, setFilter] = useState<WorkOrderFilter>('active')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const {
    workOrders,
    isLoading,
    error,
    updateLocalStatus,
    unarchive,
    deleteAllArchived,
    createWorkOrder,
  } = useWorkOrders(filter)

  async function handleStatusChange(caseNumber: string, status: string) {
    // Optimistic update first
    updateLocalStatus(caseNumber, status)
    try {
      await updateWorkOrderStatus(caseNumber, status as 'open' | 'inProgress' | 'done')
    } catch (e) {
      console.error('Failed to update work order status:', e)
      // No revert — server will be consistent on next page load
    }
  }

  function getSummaryText(): string {
    const n = workOrders.length
    const s = n !== 1 ? 's' : ''
    if (filter === 'active') {
      const openCount = workOrders.filter((wo) => wo.status !== 'done').length
      const doneCount = workOrders.filter((wo) => wo.status === 'done').length
      return `${n} active work order${s} (${openCount} open, ${doneCount} done)`
    }
    if (filter === 'archived') {
      return `${n} archived work order${s}`
    }
    // 'all'
    const activeCount = workOrders.filter((wo) => wo.archivedAt === null).length
    const archivedCount = workOrders.filter((wo) => wo.archivedAt !== null).length
    return `${n} work order${s} (${activeCount} active, ${archivedCount} archived)`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-400 text-sm">
        Failed to load work orders: {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-10rem)]">
      {/* Archive filter tabs + Create CTA (Phase 129.1-05 WO-MANUAL-01) */}
      <div className="flex items-center justify-between pb-1 mb-3">
        <div className="flex gap-2">
          {ARCHIVE_FILTERS.map((f) => {
            const isActive = f.value === filter
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-900/80 text-gray-100 hover:bg-gray-400/30'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-teal-600 text-white hover:bg-teal-700 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors"
        >
          + Create work order
        </button>
      </div>

      {/* Summary line + Clear Archived button */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-400">
          {getSummaryText()}
        </div>
        {filter === 'archived' && workOrders.length > 0 && (
          <button
            onClick={() => {
              const confirmed = window.confirm(
                `Delete ${workOrders.length} archived work orders? This cannot be undone.`
              )
              if (confirmed) deleteAllArchived()
            }}
            className="bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Clear Archived
          </button>
        )}
      </div>

      {workOrders.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          {filter === 'active' && 'No active work orders. Run the daily brief CLI to sync work orders.'}
          {filter === 'archived' && 'No archived work orders.'}
          {filter === 'all' && 'No work orders synced yet. Run the daily brief CLI to sync work orders.'}
        </div>
      ) : (
        <div className="divide-y divide-gray-900/40 rounded-lg border border-gray-900/40 overflow-hidden">
          {workOrders.map((wo) => {
            const isArchived = wo.archivedAt !== null
            return (
              <WorkOrderRow
                key={wo.caseNumber}
                workOrder={wo}
                priorityRank={isArchived ? null : wo.priorityRank}
                onStatusChange={handleStatusChange}
                isArchived={isArchived}
                onUnarchive={() => unarchive(wo.caseNumber)}
              />
            )
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateWorkOrderModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createWorkOrder}
        />
      )}
    </div>
  )
}
