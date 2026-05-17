import { useEffect, useState } from 'react'
import type { WorkOrderApiResponse } from '../api/client'
import type { ManualCreateInput } from '../hooks/useWorkOrders'

/**
 * Phase 129.1-05 / WO-MANUAL-02 — operator reviews a pending_review draft
 * (created by the screenshot endpoint in plan 129.1-03) and either commits
 * with optional edits or hard-discards.
 *
 * Mirrors CreateWorkOrderModal's shell + 11-field form. Adds:
 *   - Pre-populated fields from `workOrder` prop
 *   - Collapsible <details> block showing extras JSON (parsed from
 *     workOrder.notes) — gracefully renders empty when notes isn't valid JSON
 *   - Commit button (teal) — calls onCommit(caseNumber, edits) then onClose
 *   - Discard button (red) — window.confirm → onDiscard(caseNumber) → onClose
 *   - Cancel button — just closes
 *
 * `department` is labeled "Maintenance Location" per the Phase 129.1-03
 * operator decision (Polaris field mapping).
 */

const DISCARD_CONFIRM = 'Discard this draft? This cannot be undone.'

interface Props {
  workOrder: WorkOrderApiResponse
  onClose: () => void
  onCommit: (caseNumber: string, edits: Partial<ManualCreateInput>) => Promise<void>
  onDiscard: (caseNumber: string) => Promise<void>
}

export default function ReviewWorkOrderModal({
  workOrder,
  onClose,
  onCommit,
  onDiscard,
}: Props) {
  // Pre-populate from the workOrder prop. We treat workOrder.notes specially:
  // the screenshot endpoint (plan 129.1-03) writes JSON-stringified extras
  // into notes. For the form's `notes` field we DO NOT show the raw extras
  // JSON (operator never wants to hand-edit JSON); we render it in the
  // collapsible details block instead, and the editable notes field stays
  // empty by default so any operator-typed notes don't collide with the
  // extras dump. If notes is not valid JSON, treat it as plain text and
  // pre-populate the editable notes field.
  let parsedExtras: Record<string, unknown> | null = null
  let initialNotes = ''
  if (workOrder.notes) {
    try {
      const maybe = JSON.parse(workOrder.notes)
      if (maybe && typeof maybe === 'object' && !Array.isArray(maybe)) {
        parsedExtras = maybe as Record<string, unknown>
      } else {
        initialNotes = workOrder.notes
      }
    } catch {
      initialNotes = workOrder.notes
    }
  }

  // NOTE: `maintenanceProblem` and `department` are not on
  // WorkOrderApiResponse today (Phase 129.1-03 will widen the response
  // shape). We accept them via `Record<string, unknown>` indexing as a
  // forward-compat seam; absent fields render as empty strings.
  const woAny = workOrder as unknown as Record<string, unknown>
  const initialMaintenanceProblem =
    typeof woAny.maintenanceProblem === 'string' ? woAny.maintenanceProblem : ''
  const initialDepartment =
    typeof woAny.department === 'string' ? woAny.department : ''

  const [caseNumber] = useState(workOrder.caseNumber)
  const [store, setStore] = useState(workOrder.store ?? '')
  const [shortDescription, setShortDescription] = useState(
    workOrder.shortDescription ?? '',
  )
  const [trade, setTrade] = useState(workOrder.trade ?? '')
  const [location, setLocation] = useState(workOrder.location ?? '')
  const [equipment, setEquipment] = useState(workOrder.equipment ?? '')
  const [priority, setPriority] = useState(workOrder.priority ?? '')
  const [contact, setContact] = useState(workOrder.contact ?? '')
  const [notes, setNotes] = useState(initialNotes)
  const [maintenanceProblem, setMaintenanceProblem] = useState(
    initialMaintenanceProblem,
  )
  const [department, setDepartment] = useState(initialDepartment)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCommit() {
    if (submitting) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onCommit(caseNumber, {
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
      const msg = e instanceof Error ? e.message : 'Failed to commit work order'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDiscard() {
    if (submitting) return
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(DISCARD_CONFIRM)
    if (!confirmed) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onDiscard(caseNumber)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to discard work order'
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
        <h2 className="text-xl font-medium text-gray-50 mb-1">
          Review draft
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Pending_review draft from screenshot extraction. Edit fields below
          and commit, or discard.
        </p>

        <div className="space-y-3">
          {/* Case number — read-only (PK; identifies the row) */}
          <div>
            <label
              htmlFor="rwo-case-number"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Case number
            </label>
            <input
              id="rwo-case-number"
              type="text"
              value={caseNumber}
              readOnly
              className="w-full bg-gray-900/50 border border-gray-400/20 rounded px-2 py-1 text-sm text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="rwo-store"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Store
            </label>
            <input
              id="rwo-store"
              type="text"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="rwo-short-description"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Short description
            </label>
            <textarea
              id="rwo-short-description"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
              rows={2}
            />
          </div>

          <div>
            <label
              htmlFor="rwo-trade"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Trade
            </label>
            <input
              id="rwo-trade"
              type="text"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="rwo-location"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Location
            </label>
            <input
              id="rwo-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="rwo-equipment"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Equipment
            </label>
            <input
              id="rwo-equipment"
              type="text"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="rwo-priority"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Priority
            </label>
            <select
              id="rwo-priority"
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

          <div>
            <label
              htmlFor="rwo-contact"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Contact
            </label>
            <input
              id="rwo-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="rwo-notes"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Notes
            </label>
            <textarea
              id="rwo-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
              rows={2}
            />
          </div>

          <div>
            <label
              htmlFor="rwo-maintenance-problem"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Maintenance problem
            </label>
            <input
              id="rwo-maintenance-problem"
              type="text"
              value={maintenanceProblem}
              onChange={(e) => setMaintenanceProblem(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>

          {/* Maintenance Location (UI label for `department` — Phase 129.1-03 Q1) */}
          <div>
            <label
              htmlFor="rwo-department"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Maintenance Location
            </label>
            <input
              id="rwo-department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-gray-900/80 border border-gray-400/30 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>
        </div>

        {/* Extras JSON collapsible — surfaces fields the vision extraction
            captured beyond the 11 editable columns (e.g. raw Polaris title,
            assignment group, etc). Operator-readable only; no edit path. */}
        <details className="mt-4 bg-gray-900/50 border border-gray-700 rounded p-3">
          <summary className="text-xs font-medium text-gray-300 cursor-pointer select-none">
            Extras (extra extracted fields)
          </summary>
          <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-words">
            {parsedExtras
              ? JSON.stringify(parsedExtras, null, 2)
              : '(no extras captured)'}
          </pre>
        </details>

        {submitError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {submitError}
          </p>
        )}

        <div className="flex justify-between items-center mt-5">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={submitting}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Discard
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-800 text-gray-200 hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={submitting}
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Commit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
