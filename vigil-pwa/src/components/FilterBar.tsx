interface FilterBarProps {
  source: string | undefined
  onSourceChange: (source: string | undefined) => void
  dateAfter: string | undefined
  onDateAfterChange: (date: string | undefined) => void
  dateBefore: string | undefined
  onDateBeforeChange: (date: string | undefined) => void
  favoritesOnly: boolean
  onFavoritesOnlyChange: (val: boolean) => void
}

export default function FilterBar({
  source,
  onSourceChange,
  dateAfter,
  onDateAfterChange,
  dateBefore,
  onDateBeforeChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}: FilterBarProps) {
  const inputStyle =
    'bg-gray-900/80 border border-gray-400/30 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-600'

  // Convert ISO string back to YYYY-MM-DD for display in date input
  function isoToDateValue(iso: string | undefined): string {
    if (!iso) return ''
    return iso.slice(0, 10) // "YYYY-MM-DD"
  }

  function handleAfterChange(value: string) {
    onDateAfterChange(value ? `${value}T00:00:00.000Z` : undefined)
  }

  function handleBeforeChange(value: string) {
    onDateBeforeChange(value ? `${value}T23:59:59.999Z` : undefined)
  }

  function handleClear() {
    onSourceChange(undefined)
    onDateAfterChange(undefined)
    onDateBeforeChange(undefined)
    onFavoritesOnlyChange(false)
  }

  const hasActiveFilters = !!source || !!dateAfter || !!dateBefore || favoritesOnly

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-900/40">
      <div className="flex flex-wrap items-center gap-2">
        {/* Source filter */}
        <select
          value={source ?? ''}
          onChange={(e) => onSourceChange(e.target.value || undefined)}
          className={inputStyle}
        >
          <option value="">All Sources</option>
          <option value="text">Text</option>
          <option value="voice">Voice</option>
          <option value="image">Image</option>
        </select>

        {/* Date range: From */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">From</span>
          <input
            type="date"
            value={isoToDateValue(dateAfter)}
            onChange={(e) => handleAfterChange(e.target.value)}
            className={inputStyle}
          />
        </div>

        {/* Date range: To */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">To</span>
          <input
            type="date"
            value={isoToDateValue(dateBefore)}
            onChange={(e) => handleBeforeChange(e.target.value)}
            className={inputStyle}
          />
        </div>

        {/* Favorites toggle */}
        <button
          onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            favoritesOnly
              ? 'text-red-400 bg-red-500/20 border border-red-500/30'
              : 'text-gray-400 bg-gray-900/80 border border-gray-400/30 hover:text-red-400'
          }`}
        >
          <span className="text-base leading-none">{favoritesOnly ? '♥' : '♡'}</span>
          Favorites
        </button>

        {/* Clear button */}
        {hasActiveFilters && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-50 bg-gray-900/80 border border-gray-400/30 hover:border-gray-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
