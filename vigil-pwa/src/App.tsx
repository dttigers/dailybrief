import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { getStoredKey } from './api/client'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'

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
            ? <Layout><DashboardPage /></Layout>
            : <Navigate to="/auth" replace />
        }
      />
    </Routes>
  )
}
