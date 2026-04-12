import { useState } from 'react'

const CATEGORIES = ['task', 'therapy', 'idea', 'reflection', 'project'] as const

interface BulkActionBarProps {
  selectedCount: number
  onDelete: () => void
  onRecategorize: (category: string) => void
  onClearSelection: () => void
  isProcessing: boolean
}

export default function BulkActionBar({
  selectedCount,
  onDelete,
  onRecategorize,
  onClearSelection,
  isProcessing,
}: BulkActionBarProps) {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)

  if (selectedCount === 0) return null

  function handleDelete() {
    if (window.confirm(`Delete ${selectedCount} thought${selectedCount === 1 ? '' : 's'}?`)) {
      onDelete()
    }
  }

  function handleRecategorize(category: string) {
    setShowCategoryMenu(false)
    onRecategorize(category)
  }

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
        {selectedCount} selected
      </span>

      <button
        onClick={handleDelete}
        disabled={isProcessing}
        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
      >
        Delete{isProcessing ? '...' : ''}
      </button>

      <div className="relative">
        <button
          onClick={() => setShowCategoryMenu((v) => !v)}
          disabled={isProcessing}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          Recategorize{isProcessing ? '...' : ''}
        </button>
        {showCategoryMenu && (
          <div className="absolute bottom-full mb-2 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleRecategorize(cat)}
                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors capitalize"
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onClearSelection}
        className="text-slate-400 hover:text-white transition-colors ml-1"
        aria-label="Clear selection"
      >
        &#x2715;
      </button>
    </div>
  )
}
