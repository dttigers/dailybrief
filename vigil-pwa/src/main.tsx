import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import * as Sentry from "@sentry/react";
import './analytics/posthog' // D-14: side-effect import — posthog.init() fires before React renders
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import './index.css'

// Phase 126 (AUTH-126-04 / D-04): Sentry browser-side init. DSN-gated mirroring
// the POSTHOG_API_KEY convention at analytics/posthog.ts. tracesSampleRate: 0 keeps
// us under the 5k events/mo free tier (only captureException fires).
// sendDefaultPii is intentionally NOT set (default false) — opting in would risk
// Bearer-token leak via HTTP breadcrumbs (RESEARCH §Security Domain).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
