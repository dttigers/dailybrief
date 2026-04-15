import { useEffect, useState } from 'react'
import type { PrintSchedule } from '../api/client'

interface ScheduleCardProps {
  title: string
  subtitle: string
  loadFn: () => Promise<PrintSchedule>
  saveFn: (s: PrintSchedule) => Promise<void>
  onSaved?: (msg: string) => void
  onError?: (msg: string) => void
  defaultSchedule: PrintSchedule
}

export function ScheduleCard({
  title,
  subtitle,
  loadFn,
  saveFn,
  onSaved,
  onError,
  defaultSchedule,
}: ScheduleCardProps) {
  const [schedule, setSchedule] = useState<PrintSchedule>(defaultSchedule)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadFn()
      .then(setSchedule)
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const timeValue =
    String(schedule.hour).padStart(2, '0') + ':' + String(schedule.minute).padStart(2, '0')

  const onTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(':').map(Number)
    if (!isNaN(h) && !isNaN(m)) setSchedule((p) => ({ ...p, hour: h, minute: m }))
  }

  const onEnabled = (e: React.ChangeEvent<HTMLInputElement>) =>
    setSchedule((p) => ({ ...p, enabled: e.target.checked }))

  const onSave = async () => {
    setSaving(true)
    try {
      await saveFn(schedule)
      onSaved?.(`${title} schedule saved`)
    } catch (e) {
      onError?.(`Failed to save: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-gray-900 border border-gray-900/40 rounded-lg p-5 mt-4">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-xs text-gray-500 mb-4">{subtitle}</p>
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-300 w-24">Time</label>
            <input
              type="time"
              value={timeValue}
              onChange={onTime}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-300 w-24">Enabled</label>
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={onEnabled}
              className="w-4 h-4 accent-teal-500"
            />
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded text-white text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </section>
  )
}
