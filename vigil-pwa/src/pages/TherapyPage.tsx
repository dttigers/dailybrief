import { useTherapy } from '../hooks/useTherapy'
import type { TherapyPrepItem } from '../api/client'

const URGENCY_STYLES: Record<TherapyPrepItem['urgency'], { label: string; style: string }> = {
  high: { label: 'High', style: 'bg-red-500/20 text-red-400' },
  medium: { label: 'Medium', style: 'bg-amber-500/20 text-amber-400' },
  low: { label: 'Low', style: 'bg-slate-700 text-slate-400' },
}

const URGENCY_ORDER: Record<TherapyPrepItem['urgency'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export default function TherapyPage() {
  const {
    patterns,
    prep,
    isLoadingPatterns,
    isLoadingPrep,
    error,
    analyzePatterns,
    generatePrep,
  } = useTherapy()

  const sortedPrepItems = prep
    ? [...prep.items].sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency])
    : []

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 text-red-300 px-4 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Section 1: Patterns */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Therapy Patterns</h2>
          <button
            onClick={analyzePatterns}
            disabled={isLoadingPatterns}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isLoadingPatterns ? 'Analyzing...' : 'Analyze Patterns'}
          </button>
        </div>

        {/* Loading */}
        {isLoadingPatterns && (
          <p className="text-slate-400 text-sm animate-pulse">Analyzing therapy patterns...</p>
        )}

        {/* Empty state */}
        {!isLoadingPatterns && patterns.length === 0 && (
          <p className="text-slate-500 text-sm">
            Analyze patterns across your therapy-classified thoughts to see recurring themes.
          </p>
        )}

        {/* Pattern cards */}
        {!isLoadingPatterns && patterns.length > 0 && (
          <div className="space-y-3">
            {patterns.map((pattern, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
              >
                <p className="font-medium text-slate-100">{pattern.theme}</p>
                <p className="text-sm text-slate-300 mt-1">{pattern.description}</p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs text-slate-400">
                    Appeared {pattern.frequency} {pattern.frequency === 1 ? 'time' : 'times'}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      pattern.trend === 'increasing'
                        ? 'text-green-400'
                        : pattern.trend === 'decreasing'
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {pattern.trend === 'increasing'
                      ? 'Increasing'
                      : pattern.trend === 'decreasing'
                        ? 'Decreasing'
                        : 'Stable'}
                  </span>
                  <span className="text-xs text-slate-500 ml-auto">
                    {Math.round(pattern.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Session Prep */}
      <div className="border-t border-slate-800 mt-6 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Session Prep</h2>
          <button
            onClick={generatePrep}
            disabled={isLoadingPrep}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isLoadingPrep ? 'Preparing...' : 'Generate Prep'}
          </button>
        </div>

        {/* Loading */}
        {isLoadingPrep && (
          <p className="text-slate-400 text-sm animate-pulse">Preparing session outline...</p>
        )}

        {/* Empty state */}
        {!isLoadingPrep && !prep && (
          <p className="text-slate-500 text-sm">
            Generate a structured therapy session prep from thoughts you want to bring to your therapist.
          </p>
        )}

        {/* Prep content */}
        {!isLoadingPrep && prep && (
          <div className="space-y-4">
            {/* Suggested focus */}
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3">
              <span className="text-xs font-medium text-indigo-400 uppercase tracking-wide">
                Suggested focus:
              </span>
              <p className="text-sm text-slate-200 mt-1">{prep.suggestedFocus}</p>
            </div>

            {/* Overall themes */}
            {prep.overallThemes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {prep.overallThemes.map((theme, i) => (
                  <span
                    key={i}
                    className="bg-slate-800 text-slate-300 rounded-full px-2.5 py-0.5 text-xs"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            )}

            {/* Prep items */}
            {sortedPrepItems.length > 0 && (
              <div className="space-y-3">
                {sortedPrepItems.map((item, i) => {
                  const urgency = URGENCY_STYLES[item.urgency]
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-800 p-4"
                    >
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${urgency.style}`}
                      >
                        {urgency.label}
                      </span>
                      <p className="font-medium text-slate-100">{item.topic}</p>
                      <p className="text-sm text-slate-300 mt-1">{item.context}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
