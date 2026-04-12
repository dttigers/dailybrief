import { useNavigate } from 'react-router'
import { clearKey } from '../api/client'
import OfflineBanner from './OfflineBanner'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()

  function handleSignOut() {
    clearKey()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <OfflineBanner />
      <nav className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="font-semibold text-lg">Vigil</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-white"
        >
          Sign out
        </button>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
