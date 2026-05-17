import { useEffect, useState } from 'react'

/**
 * Phase 129.1-05 / WO-MANUAL-01 — manual create modal for the PWA work-orders
 * page. Renders 11 editable fields covering every operator-typeable column in
 * `work_orders` (case_number, store, short_description, trade, location,
 * equipment, priority, contact, notes, maintenance_problem, department) and
 * submits a single `{...input, state: "open", clientCaptureId}` payload to
 * useWorkOrders.createWorkOrder.
 *
 * `department` is rendered as "Maintenance Location" in the UI (operator
 * decision Phase 129.1-03 Q1 — Polaris field mapping). The underlying field
 * name in the payload stays `department` for schema alignment.
 *
 * Validation: case_number is the only form-level enforced rule —
 * /^[A-Z0-9]+$/. Server has no regex check (RESEARCH §949 / T-129.1-28), so
 * this is the only gate. Submit is disabled until both case_number and
 * short_description are present and case_number matches the regex.
 *
 * Close: Escape key, Cancel button, outside-click on overlay.
 */

const CASE_NUMBER_REGEX = /^[A-Z0-9]+$/

export interface ManualCreateInput {
  caseNumber: string
  store: string
  shortDescription: string
  trade: string
  location: string
  equipment: string
  priority: string
  contact: string
  notes: string
  maintenanceProblem: string
  department: string
}

function validateCaseNumber(value: string): true | string {
  if (!value) return 'Case number is required'
  if (!CASE_NUMBER_REGEX.test(value)) {
    return 'Case number must contain only A-Z and 0-9'
  }
  return true
}

interface Props {
  onClose: () => void
  onCreate: (input: ManualCreateInput) => Promise<void>
}

export default function CreateWorkOrderModal({ onClose, onCreate }: Props) {
  const [caseNumber, setCaseNumber] = useState('')
  const [store, setStore] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [trade, setTrade] = useState('')
  const [location, setLocation] = useState('')
  const [equipment, setEquipment] = useState('')
  const [priority, setPriority] = useState('')
  const [contact, setContact] = useState('')
  const [notes, setNotes] = useState('')
  const [maintenanceProblem, setMaintenanceProblem] = useState('')
  const [department, setDepartment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Live validation
  const caseNumberError =
    caseNumber.length > 0 && !CASE_NUMBER_REGEX.test(caseNumber)
      ? 'Case number must contain only A-Z and 0-9'
      : null

  const canSubmit =
    caseNumber.length > 0 &&
    CASE_NUMBER_REGEX.test(caseNumber) &&
    shortDescription.length > 0 &&
    !submitting

  // Escape-to-close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onCreate({
        caseNumber,
        store,
        shortDescription,
        trade,
        location,
        equipment,
        priority,
        contact,
        notes,
        maintenanceProblem,
        department,
      })
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create work order'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-auto border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-medium text-gray-50 mb-4">Create work order</h2>

        <div className="space-y-3">
          {/* Case number */}
          <div>
            <label
              htmlFor="cwo-case-number"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Case number <span className="text-red-400">*</span>
            </label>
            <input
              id="cwo-case-number"
              type="text"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
              autoFocus
            />
            {caseNumberError && (
              <p className="text-xs text-red-400 mt-1">{caseNumberError}</p>
            )}
          </div>

          {/* Store */}
          <div>
            <label
              htmlFor="cwo-store"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Store
            </label>
            <input
              id="cwo-store"
              type="text"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Short description */}
          <div>
            <label
              htmlFor="cwo-short-description"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Short description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="cwo-short-description"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
              rows={2}
            />
          </div>

          {/* Trade */}
          <div>
            <label
              htmlFor="cwo-trade"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Trade
            </label>
            <input
              id="cwo-trade"
              type="text"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Location */}
          <div>
            <label
              htmlFor="cwo-location"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Location
            </label>
            <input
              id="cwo-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Equipment */}
          <div>
            <label
              htmlFor="cwo-equipment"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Equipment
            </label>
            <input
              id="cwo-equipment"
              type="text"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="cwo-priority"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Priority
            </label>
            <select
              id="cwo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            >
              <option value="">(none)</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          {/* Contact */}
          <div>
            <label
              htmlFor="cwo-contact"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Contact
            </label>
            <input
              id="cwo-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="cwo-notes"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Notes
            </label>
            <textarea
              id="cwo-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
              rows={2}
            />
          </div>

          {/* Maintenance problem */}
          <div>
            <label
              htmlFor="cwo-maintenance-problem"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Maintenance problem
            </label>
            <input
              id="cwo-maintenance-problem"
              type="text"
              value={maintenanceProblem}
              onChange={(e) => setMaintenanceProblem(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Maintenance Location (UI label for `department` column —
              Phase 129.1-03 operator decision Q1 / Polaris field mapping) */}
          <div>
            <label
              htmlFor="cwo-department"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Maintenance Location
            </label>
            <input
              id="cwo-department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>
        </div>

        {submitError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {submitError}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Re-export for tests that want to import the validator directly.
export { validateCaseNumber, CASE_NUMBER_REGEX }
