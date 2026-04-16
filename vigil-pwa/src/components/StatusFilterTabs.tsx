export type TaskStatusFilter = 'open' | 'done' | 'all'

interface StatusFilterTabsProps {
  activeFilter: TaskStatusFilter
  onChange: (filter: TaskStatusFilter) => void
}

const FILTERS: { label: string; value: TaskStatusFilter }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Done', value: 'done' },
  { label: 'All', value: 'all' },
]

export default function StatusFilterTabs({ activeFilter, onChange }: StatusFilterTabsProps) {
  return (
    <div className="flex gap-2 pb-1">
      {FILTERS.map((f) => {
        const isActive = f.value === activeFilter
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-teal-600 text-white'
                : 'bg-gray-900/80 text-gray-100 hover:bg-gray-400/30'
            }`}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
