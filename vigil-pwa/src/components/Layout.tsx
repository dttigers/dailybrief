import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { clearKey } from '../api/client'
import { useGoogleStatus } from '../hooks/useGoogleStatus'
import OfflineBanner from './OfflineBanner'

interface LayoutProps {
  children: React.ReactNode
}

const PRIMARY_TABS = [
  { label: 'Thoughts', to: '/' },
  { label: 'Work Orders', to: '/work-orders' },
  { label: 'Chat', to: '/chat' },
]

const SECONDARY_TABS = [
  { label: 'Projects', to: '/projects' },
  { label: 'Insights', to: '/insights' },
  { label: 'Therapy', to: '/therapy' },
  { label: 'Briefs', to: '/history' },
  { label: 'Upload', to: '/upload' },
]

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { status } = useGoogleStatus()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const needsAttention =
    !status ||
    status.calendar === 'needs_auth' ||
    status.gmail === 'needs_auth'

  const secondaryActive = SECONDARY_TABS.some((t) =>
    t.to === '/' ? location.pathname === '/' : location.pathname.startsWith(t.to)
  )

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSignOut() {
    clearKey()
    navigate('/auth')
  }

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-50">
      <OfflineBanner />
      <nav className="px-4 py-3 border-b border-gray-900/40 flex items-center justify-between">
        <span className="font-medium text-lg">Vigil</span>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            aria-label="Settings"
            className="relative p-1 text-gray-400 hover:text-gray-50 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {needsAttention && (
              <span
                data-testid="google-status-dot"
                aria-label="needs attention"
                className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"
              />
            )}
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-gray-50"
          >
            Sign out
          </button>
        </div>
      </nav>
      <div className="flex border-b border-gray-900/40 px-2 sm:px-4 items-end">
        {PRIMARY_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              isActive(tab.to)
                ? 'border-teal-600 text-gray-50'
                : 'border-transparent text-gray-400 hover:text-gray-50 hover:border-gray-400'
            }`}
          >
            {tab.label}
          </Link>
        ))}

        <div className="w-px h-4 bg-gray-700 mx-1 self-center" />

        <div ref={moreRef} className="relative">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
              secondaryActive && !moreOpen
                ? 'border-teal-600 text-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-400'
            }`}
          >
            More
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-32"
            >
              {SECONDARY_TABS.map((tab) => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className={`block px-4 py-2 text-sm transition-colors ${
                    isActive(tab.to)
                      ? 'text-teal-400 bg-gray-700/50'
                      : 'text-gray-400 hover:text-gray-50 hover:bg-gray-700/50'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
