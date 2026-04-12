import { useEffect, useState } from 'react'
import CategoryTabs from '../components/CategoryTabs'
import SearchBar from '../components/SearchBar'
import ThoughtList from '../components/ThoughtList'
import { useThoughts } from '../hooks/useThoughts'

export default function ThoughtsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { thoughts, total, isLoading, error, updateLocal } = useThoughts(activeCategory, debouncedQuery)

  return (
    <div className="space-y-4">
      <SearchBar value={searchInput} onChange={setSearchInput} />
      <CategoryTabs activeCategory={activeCategory} onChange={setActiveCategory} />
      <ThoughtList
        thoughts={thoughts}
        total={total}
        isLoading={isLoading}
        error={error}
        onUpdate={updateLocal}
      />
    </div>
  )
}
