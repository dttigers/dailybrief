import { updateWorkOrderStatus } from '../api/client'
import WorkOrderRow from '../components/WorkOrderRow'
import { useWorkOrders } from '../hooks/useWorkOrders'

export default function WorkOrdersPage() {
  const { workOrders, isLoading, error, updateLocalStatus } = useWorkOrders()

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

  const openCount = workOrders.filter((wo) => wo.status !== 'done').length
  const doneCount = workOrders.filter((wo) => wo.status === 'done').length

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

  if (workOrders.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 text-sm">
        No work orders synced yet. Run the daily brief CLI to sync work orders.
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-10rem)]">
      <div className="mb-3 text-sm text-gray-400">
        {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''}{' '}
        <span className="text-gray-400">
          ({openCount} open, {doneCount} done)
        </span>
      </div>
      <div className="divide-y divide-gray-900/40 rounded-lg border border-gray-900/40 overflow-hidden">
        {workOrders.map((wo) => (
          <WorkOrderRow
            key={wo.caseNumber}
            workOrder={wo}
            priorityRank={wo.priorityRank}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  )
}
