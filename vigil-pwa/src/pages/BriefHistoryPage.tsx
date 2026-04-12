import { useState } from 'react'
import { useBriefs } from '../hooks/useBriefs'
import { getBriefByDate, type BriefApiResponse } from '../api/client'

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function renderSummary(summary: unknown): React.ReactNode {
  if (typeof summary === 'string') {
    return <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
  }
  return (
    <pre className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap overflow-x-auto bg-slate-900 rounded-lg p-4 border border-slate-700">
      {JSON.stringify(summary, null, 2)}
    </pre>
  )
}

export default function BriefHistoryPage() {
  const { briefs, loading, error } = useBriefs()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detail, setDetail] = useState<BriefApiResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function handleSelectBrief(date: string) {
    setSelectedDate(date)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const brief = await getBriefByDate(date)
      setDetail(brief)
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load brief')
    } finally {
      setDetailLoading(false)
    }
  }

  function handleBack() {
    setSelectedDate(null)
    setDetail(null)
    setDetailError(null)
  }

  // Detail view
  if (selectedDate !== null) {
    return (
      <div>
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <span aria-hidden="true">&larr;</span> Back to History
        </button>

        {detailLoading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-1/3 mb-4" />
            <div className="h-4 bg-slate-800 rounded w-full" />
            <div className="h-4 bg-slate-800 rounded w-5/6" />
            <div className="h-4 bg-slate-800 rounded w-4/6" />
          </div>
        )}

        {detailError && (
          <div className="bg-red-900/50 text-red-300 px-4 py-3 rounded-lg text-sm">
            {detailError}
          </div>
        )}

        {detail && !detailLoading && (
          <div>
            <h1 className="text-lg font-semibold text-slate-100 mb-1">
              {formatDate(detail.date)}
            </h1>
            <div className="flex gap-4 text-xs text-slate-500 mb-6">
              <span>{detail.thoughtCount} thought{detail.thoughtCount !== 1 ? 's' : ''}</span>
              <span>{detail.taskCount} task{detail.taskCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              {renderSummary(detail.summary)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-100 mb-6">Brief History</h1>

      {error && (
        <div className="bg-red-900/50 text-red-300 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 animate-pulse"
            >
              <div className="h-4 bg-slate-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-1/4" />
            </div>
          ))}
        </div>
      )}

      {!loading && briefs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-slate-400 text-sm">No briefs found.</p>
        </div>
      )}

      {!loading && briefs.length > 0 && (
        <div className="space-y-3">
          {briefs.map((brief) => (
            <button
              key={brief.id}
              onClick={() => handleSelectBrief(brief.date)}
              className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/60 hover:border-indigo-500/40 p-4 transition-colors"
            >
              <p className="text-sm font-medium text-slate-100 mb-1">
                {formatDate(brief.date)}
              </p>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{brief.thoughtCount} thought{brief.thoughtCount !== 1 ? 's' : ''}</span>
                <span>{brief.taskCount} task{brief.taskCount !== 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
