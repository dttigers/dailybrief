import { useState, useEffect, useRef } from 'react'
import { useBriefs } from '../hooks/useBriefs'
import {
  generateBrief,
  getBriefPdf,
  type BriefApiResponse,
  BriefPdfFetchError,
  type BriefPdfFetchErrorCode,
} from '../api/client'

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BriefHistoryPage() {
  const { briefs, loading, error } = useBriefs()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailBlobUrl, setDetailBlobUrl] = useState<string | null>(null)
  const [detailErrorCode, setDetailErrorCode] = useState<BriefPdfFetchErrorCode | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  // WR-02: ref tracks the live detail blob URL so rapid selection clicks always
  // revoke the correct previous URL, even when the async callback is still in-flight.
  const detailBlobUrlRef = useRef<string | null>(null)

  // Generate section state
  const [generateState, setGenerateState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [todayBlobUrl, setTodayBlobUrl] = useState<string | null>(null)

  // Today detection using local date (NOT UTC) to avoid timezone mismatch
  const today = new Date()
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  const todayBriefExists = !loading && briefs.some((b) => b.date === todayStr)

  // Auto-load today's PDF when it exists and no blob URL yet.
  // All closure values read inside this effect are included in deps — no suppression needed.
  useEffect(() => {
    if (!todayBriefExists || todayBlobUrl || generateState !== 'idle') return
    let active = true
    getBriefPdf(todayStr).then((blob) => {
      if (!active) return
      const url = URL.createObjectURL(blob)
      setTodayBlobUrl(url)
      setGenerateState('done')
    }).catch(() => {
      // Silently fail — user can still click Regenerate
    })
    return () => { active = false }
  }, [todayBriefExists, todayStr, generateState, todayBlobUrl])

  // Blob URL cleanup on unmount or URL change
  useEffect(() => {
    return () => {
      if (todayBlobUrl) URL.revokeObjectURL(todayBlobUrl)
    }
  }, [todayBlobUrl])

  useEffect(() => {
    return () => {
      if (detailBlobUrl) URL.revokeObjectURL(detailBlobUrl)
    }
  }, [detailBlobUrl])

  async function handleGenerate() {
    setGenerateState('generating')
    setGenerateError(null)
    try {
      const blob = await generateBrief()
      if (todayBlobUrl) URL.revokeObjectURL(todayBlobUrl)
      const url = URL.createObjectURL(blob)
      setTodayBlobUrl(url)
      setGenerateState('done')
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : 'Brief generation failed. Try again.')
      setGenerateState('error')
    }
  }

  async function handleSelectBrief(date: string) {
    // WR-02: revoke via ref so rapid clicks always clean up the correct previous URL,
    // even if the prior in-flight callback hasn't settled yet.
    if (detailBlobUrlRef.current) {
      URL.revokeObjectURL(detailBlobUrlRef.current)
      detailBlobUrlRef.current = null
    }
    setSelectedDate(date)
    setDetailBlobUrl(null)
    setDetailError(null)
    setDetailErrorCode(null)
    setDetailLoading(true)
    try {
      const blob = await getBriefPdf(date)
      const url = URL.createObjectURL(blob)
      detailBlobUrlRef.current = url
      setDetailBlobUrl(url)
    } catch (e: unknown) {
      if (e instanceof BriefPdfFetchError) {
        setDetailErrorCode(e.code)
        setDetailError(e.message)
      } else {
        setDetailErrorCode('http_error')
        setDetailError(e instanceof Error ? e.message : 'Failed to load brief. Try again.')
      }
    } finally {
      setDetailLoading(false)
    }
  }

  function handleBack() {
    if (detailBlobUrlRef.current) {
      URL.revokeObjectURL(detailBlobUrlRef.current)
      detailBlobUrlRef.current = null
    }
    setSelectedDate(null)
    setDetailBlobUrl(null)
    setDetailError(null)
    setDetailErrorCode(null)
  }

  async function handleRegenerateDetail() {
    setRegenerating(true)
    setDetailError(null)
    try {
      // WR-02: POST /brief/generate always generates TODAY's brief. We intentionally
      // reload the page to force useBriefs to re-fetch on mount — any local state
      // updates on the success path would be discarded by the reload, so we skip
      // them. The returned blob is discarded too; the reload-triggered effect will
      // re-fetch today's PDF fresh. Browser GC handles the transient blob on nav.
      await generateBrief()
      window.location.reload()
      // Nothing after reload() runs on the success path.
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Regenerate failed. Try again.')
      setRegenerating(false)
    }
  }

  // Detail view
  if (selectedDate !== null) {
    const briefMeta: BriefApiResponse | undefined = briefs.find((b) => b.date === selectedDate)
    return (
      <div>
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-50 mb-6 transition-colors"
        >
          <span aria-hidden="true">&larr;</span> Back to Briefs
        </button>

        {detailLoading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-6 bg-gray-400/30 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-900/80 rounded w-full" />
            <div className="h-4 bg-gray-900/80 rounded w-5/6" />
            <div className="h-4 bg-gray-900/80 rounded w-4/6" />
          </div>
        )}

        {!detailLoading && detailErrorCode === 'brief_pdf_not_stored' && (
          <div className="bg-gray-900/50 border border-gray-900/40 px-4 py-4 rounded-lg">
            <p className="text-sm font-medium text-gray-50 mb-1">
              {formatDate(selectedDate)}
            </p>
            <p className="text-sm text-gray-400 mb-3">
              This brief's PDF isn't stored — regenerate to rebuild it.
            </p>
            <button
              onClick={handleRegenerateDetail}
              disabled={regenerating}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
            >
              {regenerating ? 'Regenerating...' : 'Regenerate Brief'}
            </button>
            {detailError && regenerating === false && (
              <p className="mt-3 text-xs text-red-300">{detailError}</p>
            )}
          </div>
        )}

        {!detailLoading && detailErrorCode === 'brief_not_found' && (
          <div className="bg-gray-900/50 border border-gray-900/40 px-4 py-4 rounded-lg">
            <p className="text-sm font-medium text-gray-50 mb-1">
              {formatDate(selectedDate)}
            </p>
            <p className="text-sm text-gray-400">
              Brief not found for this date.
            </p>
          </div>
        )}

        {!detailLoading && detailErrorCode === 'http_error' && (
          <div className="bg-red-900/50 text-red-300 px-4 py-3 rounded-lg text-sm">
            Failed to load brief. Try again.
          </div>
        )}

        {detailBlobUrl && !detailLoading && detailErrorCode === null && (
          <div>
            <iframe
              src={detailBlobUrl}
              title="Daily Brief PDF"
              className="w-full rounded-lg border border-teal-600 overflow-hidden h-[400px] sm:h-[600px]"
            />
            {briefMeta && (
              <div className="mt-4">
                <h1 className="text-lg font-medium text-gray-50 mb-1">
                  {formatDate(briefMeta.date)}
                </h1>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{briefMeta.thoughtCount} thought{briefMeta.thoughtCount !== 1 ? 's' : ''}</span>
                  <span>{briefMeta.taskCount} task{briefMeta.taskCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
            <a
              href={detailBlobUrl}
              download={`vigil-brief-${selectedDate}.pdf`}
              className="mt-3 inline-flex items-center px-4 py-2 border border-teal-600 text-teal-400 hover:text-teal-400 hover:border-teal-400 text-sm font-medium rounded-lg transition-colors min-h-[44px]"
            >
              Download PDF
            </a>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div>
      <h1 className="text-lg font-medium text-gray-50 mb-6">Briefs</h1>

      {/* Today's Brief section */}
      <div className="mb-2">
        <p className="text-sm font-normal text-gray-400 uppercase tracking-wide mb-3">Today's Brief</p>

        {generateState === 'generating' && (
          <div className="flex items-center gap-3 py-3 text-gray-400 text-sm">
            <svg
              className="animate-spin h-5 w-5 text-teal-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generating your brief...
          </div>
        )}

        {generateState === 'error' && (
          <div className="bg-red-900/50 text-red-300 px-4 py-3 rounded-lg text-sm mb-3">
            {generateError}
          </div>
        )}

        {(generateState === 'done' || (generateState === 'idle' && todayBriefExists)) && todayBlobUrl && (
          <div>
            <iframe
              src={todayBlobUrl}
              title="Daily Brief PDF"
              className="w-full rounded-lg border border-teal-600 overflow-hidden h-[400px] sm:h-[600px]"
            />
            <div className="flex flex-wrap gap-3 mt-3">
              <a
                href={todayBlobUrl}
                download={`vigil-brief-${todayStr}.pdf`}
                className="inline-flex items-center px-4 py-2 border border-teal-600 text-teal-400 hover:text-teal-400 hover:border-teal-400 text-sm font-medium rounded-lg transition-colors min-h-[44px]"
              >
                Download PDF
              </a>
              <button
                onClick={handleGenerate}
                className="mt-3 px-4 py-2 border border-gray-400/30 text-gray-400 hover:text-gray-50 hover:border-gray-400 text-sm rounded-lg transition-colors"
              >
                Regenerate Brief
              </button>
            </div>
          </div>
        )}

        {generateState !== 'generating' && generateState !== 'done' && !(generateState === 'idle' && todayBriefExists && todayBlobUrl) && (
          <button
            onClick={handleGenerate}
            disabled={generateState === 'generating'}
            className="w-full sm:w-auto px-6 py-3 bg-teal-600 hover:bg-teal-400 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
          >
            Generate Today's Brief
          </button>
        )}
      </div>

      <div className="border-t border-gray-900/40 my-6" />

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
              className="rounded-lg border border-gray-900/40 bg-gray-900/50 p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-400/30 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-900/80 rounded w-1/4" />
            </div>
          ))}
        </div>
      )}

      {!loading && briefs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-gray-50 font-medium mb-2">No briefs yet</p>
          <p className="text-gray-400 text-sm">Generate your first daily brief to get started.</p>
        </div>
      )}

      {!loading && briefs.length > 0 && (
        <div className="space-y-3">
          {briefs.map((brief) => (
            <button
              key={brief.id}
              onClick={() => handleSelectBrief(brief.date)}
              className="w-full text-left rounded-lg border border-gray-900/40 bg-gray-900/50 hover:bg-gray-900/60 hover:border-teal-600/40 p-4 transition-colors"
            >
              <p className="text-sm font-medium text-gray-50 mb-1">
                {formatDate(brief.date)}
              </p>
              <div className="flex gap-4 text-xs text-gray-400">
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
