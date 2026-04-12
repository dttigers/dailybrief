import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { getStoredKey } from './api/client'
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
                </Routes>
              </Layout>
            )
            : <Navigate to="/auth" replace />
        }
      />
    </Routes>
  )
}
