import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { getStoredKey } from './api/client'
import { GoogleStatusProvider } from './hooks/GoogleStatusContext'
import { ToastProvider } from './hooks/useToast'
import ToastHost from './components/ToastHost'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import WorkOrdersPage from './pages/WorkOrdersPage'
import ProjectsPage from './pages/ProjectsPage'
import ChatPage from './pages/ChatPage'
import InsightsPage from './pages/InsightsPage'
import TherapyPage from './pages/TherapyPage'
import BriefHistoryPage from './pages/BriefHistoryPage'
import UploadPage from './pages/UploadPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => getStoredKey() !== null)

  function handleAuthSuccess() {
    setIsAuthenticated(true)
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          isAuthenticated
            ? <Navigate to="/" replace />
            : <AuthPage onAuthSuccess={handleAuthSuccess} />
        }
      />
      <Route
        path="/*"
        element={
          isAuthenticated
            ? (
              <GoogleStatusProvider>
                <ToastProvider>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/work-orders" element={<WorkOrdersPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/chat" element={<ChatPage />} />
                      <Route path="/insights" element={<InsightsPage />} />
                      <Route path="/therapy" element={<TherapyPage />} />
                      <Route path="/history" element={<BriefHistoryPage />} />
                      <Route path="/upload" element={<UploadPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                  </Layout>
                  {/* Phase 101 Pitfall 7: ToastHost mounts OUTSIDE <Routes> so it
                      survives route navigation and deferred-commit timers fire
                      regardless of which page is active. */}
                  <ToastHost />
                </ToastProvider>
              </GoogleStatusProvider>
            )
            : <Navigate to="/auth" replace />
        }
      />
    </Routes>
  )
}
