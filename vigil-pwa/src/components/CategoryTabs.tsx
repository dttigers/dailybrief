interface CategoryTabsProps {
  activeCategory: string | null
  onChange: (category: string | null) => void
}

const TABS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Task', value: 'task' },
  { label: 'Therapy', value: 'therapy' },
  { label: 'Idea', value: 'idea' },
  { label: 'Reflection', value: 'reflection' },
  { label: 'Project', value: 'project' },
]

export default function CategoryTabs({ activeCategory, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {TABS.map((tab) => {
        const isActive = tab.value === activeCategory
        return (
          <button
            key={tab.label}
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-teal-600 text-white'
                : 'bg-gray-900/80 text-gray-100 hover:bg-gray-400/30'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
