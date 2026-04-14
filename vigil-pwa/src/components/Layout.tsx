import { Link, useLocation, useNavigate } from 'react-router'
import { clearKey } from '../api/client'
import { useGoogleStatus } from '../hooks/useGoogleStatus'
import OfflineBanner from './OfflineBanner'

interface LayoutProps {
  children: React.ReactNode
}

const TABS = [
  { label: 'Thoughts', to: '/' },
  { label: 'Work Orders', to: '/work-orders' },
  { label: 'Projects', to: '/projects' },
  { label: 'Chat', to: '/chat' },
  { label: 'Insights', to: '/insights' },
  { label: 'Therapy', to: '/therapy' },
  { label: 'Briefs', to: '/history' },
  { label: 'Upload', to: '/upload' },
]

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { status } = useGoogleStatus()
  const needsAttention =
    !status ||
    status.calendar === 'needs_auth' ||
    status.gmail === 'needs_auth'

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
      <div className="flex border-b border-gray-900/40 px-4">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive(tab.to)
                ? 'border-teal-600 text-gray-50'
                : 'border-transparent text-gray-400 hover:text-gray-50 hover:border-gray-400'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
