import { Link, useLocation, useNavigate } from 'react-router'
import { clearKey } from '../api/client'
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
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-gray-50"
        >
          Sign out
        </button>
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
