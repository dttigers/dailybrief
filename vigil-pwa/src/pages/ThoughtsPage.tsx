import { useEffect, useState } from 'react'
import CaptureBar from '../components/CaptureBar'
import CategoryTabs from '../components/CategoryTabs'
import SearchBar from '../components/SearchBar'
import ThoughtList from '../components/ThoughtList'
import { updateThought } from '../api/client'
import { useThoughts } from '../hooks/useThoughts'

export default function ThoughtsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { thoughts, total, isLoading, error, updateLocal, prependThought } = useThoughts(
    activeCategory,
    debouncedQuery,
  )

  async function handleUpdate(id: number, patch: { content?: string; category?: string }) {
    await updateThought(id, patch)
    updateLocal(id, patch)
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="space-y-4">
        <SearchBar value={searchInput} onChange={setSearchInput} />
        <CategoryTabs activeCategory={activeCategory} onChange={setActiveCategory} />
      </div>
      <div className="flex-1 overflow-y-auto mt-4">
        <ThoughtList
          thoughts={thoughts}
          total={total}
          isLoading={isLoading}
          error={error}
          onUpdate={handleUpdate}
        />
      </div>
      <CaptureBar
        onCapture={prependThought}
        onCategoryUpdate={(id, category) => updateLocal(id, { category })}
      />
    </div>
  )
}
