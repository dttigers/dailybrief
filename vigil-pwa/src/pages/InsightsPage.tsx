import { useInsights } from '../hooks/useInsights'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import type { Insight } from '../api/client'

const TYPE_BADGE_STYLES: Record<Insight['type'], { label: string; style: string }> = {
  pattern: { label: 'Pattern', style: 'bg-info-50 text-info-400' },
  connection: { label: 'Connection', style: 'bg-green-500/20 text-green-400' },
  actionPrompt: { label: 'Action', style: 'bg-amber-500/20 text-amber-400' },
  trend: { label: 'Trend', style: 'bg-purple-500/20 text-purple-400' },
}

export default function InsightsPage() {
  const { insights, isLoading, isCached, generatedAt, error, generate, regenerate } = useInsights()

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-gray-50">Insights</h1>
          <p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>
        </div>
        {isCached && generatedAt && !isLoading ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Generated {formatRelativeTime(generatedAt)}</span>
            <button
              onClick={() => regenerate()}
              disabled={isLoading}
              className="bg-gray-900/80 hover:bg-gray-800 disabled:opacity-40 text-gray-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-400/20"
            >
              Regenerate
            </button>
          </div>
        ) : (
          <button
            onClick={() => generate()}
            disabled={isLoading}
            className="bg-teal-600 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? 'Analyzing...' : 'Generate Insights'}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 text-red-300 px-4 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-900/40 bg-gray-900/50 p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-400/30 rounded w-1/4 mb-3" />
              <div className="h-4 bg-gray-400/30 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-900/80 rounded w-full" />
            </div>
          ))}
          <p className="text-center text-gray-400 text-sm mt-4">Analyzing your thoughts...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && insights.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-gray-400 text-sm max-w-sm">
            Generate insights from your recent thoughts to see patterns, connections, and action prompts.
          </p>
        </div>
      )}

      {/* Insight cards */}
      {!isLoading && insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const badge = TYPE_BADGE_STYLES[insight.type] ?? { label: insight.type, style: 'bg-gray-400/30 text-gray-400' }
            return (
              <div
                key={i}
                className="rounded-lg border border-gray-900/40 bg-gray-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.style}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {Math.round(insight.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="font-medium text-gray-50 text-sm mb-1">{insight.title}</p>
                <p className="text-sm text-gray-100 leading-relaxed">{insight.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
