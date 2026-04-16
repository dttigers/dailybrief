import { useTherapy } from '../hooks/useTherapy'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import type { TherapyPrepItem } from '../api/client'

const URGENCY_STYLES: Record<TherapyPrepItem['urgency'], { label: string; style: string }> = {
  high: { label: 'High', style: 'bg-red-500/20 text-red-400' },
  medium: { label: 'Medium', style: 'bg-amber-500/20 text-amber-400' },
  low: { label: 'Low', style: 'bg-gray-400/30 text-gray-400' },
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
    isCachedPatterns,
    isCachedPrep,
    patternsGeneratedAt,
    prepGeneratedAt,
    error,
    analyzePatterns,
    generatePrep,
    regeneratePatterns,
    regeneratePrep,
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
          <div>
            <h2 className="text-lg font-medium text-gray-50">Therapy Patterns</h2>
            <p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>
          </div>
          {isCachedPatterns || (patternsGeneratedAt && isLoadingPatterns) ? (
            <div className="flex items-center gap-3">
              {patternsGeneratedAt && !isLoadingPatterns && (
                <span className="text-xs text-gray-400">Generated {formatRelativeTime(patternsGeneratedAt)}</span>
              )}
              <button
                onClick={regeneratePatterns}
                disabled={isLoadingPatterns}
                className="bg-gray-900/80 hover:bg-gray-800 disabled:opacity-40 text-gray-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-400/20"
              >
                {isLoadingPatterns ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          ) : (
            <button
              onClick={analyzePatterns}
              disabled={isLoadingPatterns}
              className="bg-teal-600 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {isLoadingPatterns ? 'Analyzing...' : 'Analyze Patterns'}
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoadingPatterns && (
          <p className="text-gray-400 text-sm animate-pulse">Analyzing therapy patterns...</p>
        )}

        {/* Empty state */}
        {!isLoadingPatterns && patterns.length === 0 && (
          <p className="text-gray-400 text-sm">
            Analyze patterns across your therapy-classified thoughts to see recurring themes.
          </p>
        )}

        {/* Pattern cards */}
        {!isLoadingPatterns && patterns.length > 0 && (
          <div className="space-y-3">
            {patterns.map((pattern, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-900/40 bg-gray-900/50 p-4"
              >
                <p className="font-medium text-gray-50">{pattern.theme}</p>
                <p className="text-sm text-gray-100 mt-1">{pattern.description}</p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs text-gray-400">
                    Appeared {pattern.frequency} {pattern.frequency === 1 ? 'time' : 'times'}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      pattern.trend === 'increasing'
                        ? 'text-green-400'
                        : pattern.trend === 'decreasing'
                          ? 'text-red-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {pattern.trend === 'increasing'
                      ? 'Increasing'
                      : pattern.trend === 'decreasing'
                        ? 'Decreasing'
                        : 'Stable'}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {Math.round(pattern.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Session Prep */}
      <div className="border-t border-gray-900/40 mt-6 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-50">Session Prep</h2>
            <p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>
          </div>
          {isCachedPrep || (prepGeneratedAt && isLoadingPrep) ? (
            <div className="flex items-center gap-3">
              {prepGeneratedAt && !isLoadingPrep && (
                <span className="text-xs text-gray-400">Generated {formatRelativeTime(prepGeneratedAt)}</span>
              )}
              <button
                onClick={regeneratePrep}
                disabled={isLoadingPrep}
                className="bg-gray-900/80 hover:bg-gray-800 disabled:opacity-40 text-gray-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-400/20"
              >
                {isLoadingPrep ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          ) : (
            <button
              onClick={generatePrep}
              disabled={isLoadingPrep}
              className="bg-teal-600 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {isLoadingPrep ? 'Preparing...' : 'Generate Prep'}
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoadingPrep && (
          <p className="text-gray-400 text-sm animate-pulse">Preparing session outline...</p>
        )}

        {/* Empty state */}
        {!isLoadingPrep && !prep && (
          <p className="text-gray-400 text-sm">
            Generate a structured therapy session prep from thoughts you want to bring to your therapist.
          </p>
        )}

        {/* Prep content */}
        {!isLoadingPrep && prep && (
          <div className="space-y-4">
            {/* Suggested focus */}
            <div className="bg-teal-600/10 border border-teal-600/30 rounded-lg p-3">
              <span className="text-xs font-medium text-teal-400 uppercase tracking-wide">
                Suggested focus:
              </span>
              <p className="text-sm text-gray-100 mt-1">{prep.suggestedFocus}</p>
            </div>

            {/* Overall themes */}
            {prep.overallThemes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {prep.overallThemes.map((theme, i) => (
                  <span
                    key={i}
                    className="bg-gray-900/80 text-gray-100 rounded-full px-2.5 py-0.5 text-xs"
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
                      className="rounded-lg border border-gray-900/40 p-4"
                    >
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${urgency.style}`}
                      >
                        {urgency.label}
                      </span>
                      <p className="font-medium text-gray-50">{item.topic}</p>
                      <p className="text-sm text-gray-100 mt-1">{item.context}</p>
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
