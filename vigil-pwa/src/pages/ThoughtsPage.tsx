import { useCallback, useEffect, useState } from 'react'
import CaptureBar from '../components/CaptureBar'
import CategoryTabs from '../components/CategoryTabs'
import StatusFilterTabs from '../components/StatusFilterTabs'
import type { TaskStatusFilter } from '../components/StatusFilterTabs'
import FilterBar from '../components/FilterBar'
import SearchBar from '../components/SearchBar'
import ThoughtList from '../components/ThoughtList'
import BulkActionBar from '../components/BulkActionBar'
import { useNavigate } from 'react-router'
import { updateThought, bulkDeleteThoughts, bulkRecategorizeThoughts, triageThought, vigilFetch, getTaskStatusFilter, putTaskStatusFilter } from '../api/client'
import type { ThoughtApiResponse } from '../api/client'
import { useThoughts, type ThoughtFilters } from '../hooks/useThoughts'
import { getCurrentWeekWindow } from '../utils/date-window-client'
import { useTimezone } from '../hooks/useTimezone'
import { useToast } from '../hooks/useToast'
import { useProjects } from '../hooks/useProjects'

export default function ThoughtsPage() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const { tz } = useTimezone()
  const [isSelectable, setIsSelectable] = useState(false)
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

  // Phase 101 — context menu wiring ---------------------------------------
  const { showToast } = useToast()
  const { projects } = useProjects()
  // D-15/D-16 deferred-commit pattern: client-side hide set + filter-on-render.
  // Row is hidden the moment Delete is tapped; the API call fires only on
  // toast expiry. Undo within 5s removes the id from the set (no API call).
  const [hiddenPendingDelete, setHiddenPendingDelete] = useState<Set<number>>(
    new Set(),
  )

  // Task status filter state
  const TASK_FILTER_STORAGE_KEY = 'vigil_task_status_filter'
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>(() => {
    const cached = localStorage.getItem(TASK_FILTER_STORAGE_KEY)
    if (cached === 'open' || cached === 'done' || cached === 'all') return cached
    return 'open'
  })

  // Sync task status filter from server on mount
  useEffect(() => {
    getTaskStatusFilter().then((serverFilter) => {
      const cached = localStorage.getItem(TASK_FILTER_STORAGE_KEY)
      if (serverFilter !== cached) {
        setTaskStatusFilter(serverFilter)
        localStorage.setItem(TASK_FILTER_STORAGE_KEY, serverFilter)
      }
    })
  }, [])

  const handleTaskStatusFilterChange = useCallback((filter: TaskStatusFilter) => {
    setTaskStatusFilter(filter)
    localStorage.setItem(TASK_FILTER_STORAGE_KEY, filter)
    putTaskStatusFilter(filter)
  }, [])

  // Filter state
  const [showFilters, setShowFilters] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<string | undefined>()
  const [dateAfter, setDateAfter] = useState<string | undefined>()
  const [dateBefore, setDateBefore] = useState<string | undefined>()
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Clear selection when filters or category change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [activeCategory, debouncedQuery, sourceFilter, dateAfter, dateBefore, favoritesOnly, taskStatusFilter])

  const filters: ThoughtFilters = {
    source: sourceFilter,
    after: dateAfter,
    before: dateBefore,
    favoritesOnly: favoritesOnly || undefined,
    taskStatusFilter: activeCategory === 'task' ? taskStatusFilter : undefined,
  }

  const { thoughts, total, isLoading, error, updateLocal, prependThought, removeMany, updateMany } = useThoughts(
    activeCategory,
    debouncedQuery,
    filters,
  )

  async function handleUpdate(id: number, patch: { content?: string; category?: string }) {
    await updateThought(id, patch)
    updateLocal(id, patch)
  }

  async function handleToggleFavorite(id: number, isFavorited: boolean) {
    await updateThought(id, { isFavorited })
    updateLocal(id, { isFavorited })
  }

  async function handleRetriage(id: number) {
    const thought = thoughts.find((t) => t.id === id)
    if (!thought) return
    const result = await triageThought(thought.content)
    await updateThought(id, { category: result.category })
    updateLocal(id, { category: result.category, confidence: result.confidence })

    // If categorized as therapy, also run therapy classification
    if (result.category === 'therapy') {
      try {
        const res = await vigilFetch('/v1/therapy/classify', {
          method: 'POST',
          body: JSON.stringify({ content: thought.content }),
        })
        if (res.ok) {
          const classification = await res.json() as { classification: string }
          await updateThought(id, { therapyClassification: classification.classification })
          updateLocal(id, { therapyClassification: classification.classification })
        }
      } catch { /* therapy classification is non-fatal */ }
    }
  }

  function handleChat(thought: ThoughtApiResponse) {
    navigate('/chat', {
      state: { thoughtText: thought.content, thoughtId: thought.id },
    })
  }

  // Phase 101 — context-menu action handlers ----------------------------------
  // D-15/D-16/D-20: delete via existing bulkDeleteThoughts with deferred commit.
  // Pattern 5 (101-RESEARCH): filter-on-render instead of optimistic removeMany,
  // so Undo is a trivial Set.delete rather than re-fetching the removed row.
  function handleDelete(id: number) {
    setHiddenPendingDelete((s) => {
      const n = new Set(s)
      n.add(id)
      return n
    })
    showToast({
      body: 'Thought deleted.',
      action: 'Undo',
      variant: 'default',
      onAction: () => {
        // User tapped Undo within 5s — un-hide, no API call.
        setHiddenPendingDelete((s) => {
          const n = new Set(s)
          n.delete(id)
          return n
        })
      },
      onExpire: async () => {
        // 5s elapsed with no Undo → commit the delete server-side.
        try {
          await bulkDeleteThoughts([id])
          removeMany(new Set([id]))
        } catch (err) {
          console.error('[ThoughtsPage] delete commit failed', err)
          // Revert optimistic hide so the row reappears.
          setHiddenPendingDelete((s) => {
            const n = new Set(s)
            n.delete(id)
            return n
          })
          showToast({ body: "Couldn't delete. Try again.", variant: 'error' })
          return
        }
        // Success — clean up the hide-set entry so it doesn't linger.
        setHiddenPendingDelete((s) => {
          if (!s.has(id)) return s
          const n = new Set(s)
          n.delete(id)
          return n
        })
      },
    })
  }

  async function handleMoveToCategory(id: number, category: string) {
    const prev = thoughts.find((t) => t.id === id)?.category
    // D-20 optimistic: flip the pill immediately, reconcile on server response.
    updateLocal(id, { category })
    try {
      await updateThought(id, { category })
    } catch (err) {
      console.error('[ThoughtsPage] move to category failed', err)
      if (prev !== undefined) updateLocal(id, { category: prev })
      showToast({ body: "Couldn't move. Try again.", variant: 'error' })
    }
  }

  async function handleAssignProject(id: number, projectId: number) {
    const prev = thoughts.find((t) => t.id === id)?.projectId
    // D-20 optimistic.
    updateLocal(id, { projectId })
    try {
      await updateThought(id, { projectId })
    } catch (err) {
      console.error('[ThoughtsPage] assign project failed', err)
      updateLocal(id, { projectId: prev ?? null })
      showToast({ body: "Couldn't add to project. Try again.", variant: 'error' })
    }
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

  // Phase 101 Pattern 5: filter-on-render for deferred-commit delete.
  // Rows pending server-deletion are hidden locally but remain in `thoughts`
  // until the toast expires (or the user hits Undo). This keeps the Undo path
  // as a trivial Set.delete instead of a re-fetch of the removed row.
  const visibleThoughts = thoughts.filter((t) => !hiddenPendingDelete.has(t.id))

  const allSelected = thoughts.length > 0 && selectedIds.size === thoughts.length
  const hasActiveFilters = !!sourceFilter || !!dateAfter || !!dateBefore || favoritesOnly

  const { formattedStart, formattedEnd } = (() => {
    const { start, end } = getCurrentWeekWindow(tz)
    const formatter = new Intl.DateTimeFormat(navigator.language, {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
    })
    // end is EXCLUSIVE (next Wed 00:00); display end-1ms so range reads Wed..Tue.
    return {
      formattedStart: formatter.format(start),
      formattedEnd: formatter.format(new Date(end.getTime() - 1)),
    }
  })()

  function handleClearFilters() {
    setSourceFilter(undefined)
    setDateAfter(undefined)
    setDateBefore(undefined)
    setFavoritesOnly(false)
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchBar value={searchInput} onChange={setSearchInput} />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 relative ${
              showFilters || hasActiveFilters
                ? 'bg-teal-600 text-white hover:bg-teal-800'
                : 'bg-gray-900/80 text-gray-100 hover:bg-gray-400/30'
            }`}
          >
            Filters
            {hasActiveFilters && !showFilters && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400" />
            )}
          </button>
          <button
            onClick={handleToggleSelectMode}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
              isSelectable
                ? 'bg-teal-600 text-white hover:bg-teal-800'
                : 'bg-gray-900/80 text-gray-100 hover:bg-gray-400/30'
            }`}
          >
            {isSelectable ? 'Cancel' : 'Select'}
          </button>
        </div>
        {showFilters && (
          <FilterBar
            source={sourceFilter}
            onSourceChange={setSourceFilter}
            dateAfter={dateAfter}
            onDateAfterChange={setDateAfter}
            dateBefore={dateBefore}
            onDateBeforeChange={setDateBefore}
            favoritesOnly={favoritesOnly}
            onFavoritesOnlyChange={setFavoritesOnly}
          />
        )}
        {isSelectable && (
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="w-5 h-5 rounded border-gray-400/30 bg-gray-900/80 accent-teal-600 cursor-pointer"
            />
            <span className="text-gray-400 text-sm">
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </div>
        )}
        <CategoryTabs activeCategory={activeCategory} onChange={setActiveCategory} />
        {activeCategory === 'task' && (
          <StatusFilterTabs activeFilter={taskStatusFilter} onChange={handleTaskStatusFilterChange} />
        )}
      </div>
      <div className="flex-1 overflow-y-auto mt-4">
        {/* Week / Search context header */}
        {debouncedQuery === '' ? (
          <p
            className="text-xs mb-2 text-left"
            role="status"
            aria-live="polite"
          >
            <span className="text-teal-400 font-medium">This week</span>
            <span className="text-gray-400"> · {formattedStart} – {formattedEnd}</span>
          </p>
        ) : (
          <p
            className="text-xs mb-2 text-left"
            role="status"
            aria-live="polite"
          >
            <span className="text-teal-400 font-medium">Search</span>
            <span className="text-gray-400"> · all time</span>
          </p>
        )}
        <ThoughtList
          thoughts={visibleThoughts}
          total={total - hiddenPendingDelete.size}
          isLoading={isLoading}
          error={error}
          onUpdate={handleUpdate}
          onToggleFavorite={handleToggleFavorite}
          onRetriage={handleRetriage}
          onChat={handleChat}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          isSelectable={isSelectable}
          isSearchActive={debouncedQuery !== ''}
          onDelete={handleDelete}
          onMoveToCategory={handleMoveToCategory}
          onAssignProject={handleAssignProject}
          projects={projects}
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
