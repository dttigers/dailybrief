import { useInsights } from '../hooks/useInsights'
import type { Insight } from '../api/client'

const TYPE_BADGE_STYLES: Record<Insight['type'], { label: string; style: string }> = {
  pattern: { label: 'Pattern', style: 'bg-blue-500/20 text-blue-400' },
  connection: { label: 'Connection', style: 'bg-green-500/20 text-green-400' },
  actionPrompt: { label: 'Action', style: 'bg-amber-500/20 text-amber-400' },
  trend: { label: 'Trend', style: 'bg-purple-500/20 text-purple-400' },
}

export default function InsightsPage() {
  const { insights, isLoading, error, generate } = useInsights()

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-100">Insights</h1>
        <button
          onClick={() => generate()}
          disabled={isLoading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Analyzing...' : 'Generate Insights'}
        </button>
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
              className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 animate-pulse"
            >
              <div className="h-4 bg-slate-700 rounded w-1/4 mb-3" />
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-full" />
            </div>
          ))}
          <p className="text-center text-slate-500 text-sm mt-4">Analyzing your thoughts...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && insights.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-slate-400 text-sm max-w-sm">
            Generate insights from your recent thoughts to see patterns, connections, and action prompts.
          </p>
        </div>
      )}

      {/* Insight cards */}
      {!isLoading && insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const badge = TYPE_BADGE_STYLES[insight.type] ?? { label: insight.type, style: 'bg-slate-700 text-slate-400' }
            return (
              <div
                key={i}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.style}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {Math.round(insight.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="font-medium text-slate-100 text-sm mb-1">{insight.title}</p>
                <p className="text-sm text-slate-300 leading-relaxed">{insight.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
