interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-gray-400"
          aria-hidden="true"
        >
          <path
            d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM14 14l-2.9-2.9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search thoughts..."
        className="w-full bg-gray-900/80 border border-gray-400/30 rounded-lg pl-10 pr-4 py-2 text-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
      />
    </div>
  )
}
