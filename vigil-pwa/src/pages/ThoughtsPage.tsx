import { useEffect, useState } from 'react'
import CaptureBar from '../components/CaptureBar'
import CategoryTabs from '../components/CategoryTabs'
import SearchBar from '../components/SearchBar'
import ThoughtList from '../components/ThoughtList'
import BulkActionBar from '../components/BulkActionBar'
import { updateThought, bulkDeleteThoughts, bulkRecategorizeThoughts } from '../api/client'
import { useThoughts } from '../hooks/useThoughts'

export default function ThoughtsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isSelectable, setIsSelectable] = useState(false)
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [activeCategory, debouncedQuery])

  const { thoughts, total, isLoading, error, updateLocal, prependThought, removeMany, updateMany } = useThoughts(
    activeCategory,
    debouncedQuery,
  )

  async function handleUpdate(id: number, patch: { content?: string; category?: string }) {
    await updateThought(id, patch)
    updateLocal(id, patch)
  }

  function handleToggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleToggleSelectMode() {
    if (isSelectable) {
      setIsSelectable(false)
      setSelectedIds(new Set())
    } else {
      setIsSelectable(true)
    }
  }

  function handleSelectAll() {
    if (selectedIds.size === thoughts.length && thoughts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(thoughts.map((t) => t.id)))
    }
  }

  async function handleBulkDelete() {
    setIsBulkProcessing(true)
    try {
      await bulkDeleteThoughts([...selectedIds])
      removeMany(selectedIds)
      setSelectedIds(new Set())
    } finally {
      setIsBulkProcessing(false)
    }
  }

  async function handleBulkRecategorize(category: string) {
    setIsBulkProcessing(true)
    try {
      await bulkRecategorizeThoughts([...selectedIds], category)
      updateMany(selectedIds, { category })
      setSelectedIds(new Set())
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const allSelected = thoughts.length > 0 && selectedIds.size === thoughts.length

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchBar value={searchInput} onChange={setSearchInput} />
          </div>
          <button
            onClick={handleToggleSelectMode}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
              isSelectable
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isSelectable ? 'Cancel' : 'Select'}
          </button>
        </div>
        {isSelectable && (
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="w-5 h-5 rounded border-slate-600 bg-slate-800 accent-indigo-500 cursor-pointer"
            />
            <span className="text-slate-400 text-sm">
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </div>
        )}
        <CategoryTabs activeCategory={activeCategory} onChange={setActiveCategory} />
      </div>
      <div className="flex-1 overflow-y-auto mt-4">
        <ThoughtList
          thoughts={thoughts}
          total={total}
          isLoading={isLoading}
          error={error}
          onUpdate={handleUpdate}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          isSelectable={isSelectable}
        />
      </div>
      <CaptureBar
        onCapture={prependThought}
        onCategoryUpdate={(id, category) => updateLocal(id, { category })}
      />
      <BulkActionBar
        selectedCount={selectedIds.size}
        onDelete={handleBulkDelete}
        onRecategorize={handleBulkRecategorize}
        onClearSelection={() => setSelectedIds(new Set())}
        isProcessing={isBulkProcessing}
      />
    </div>
  )
}
