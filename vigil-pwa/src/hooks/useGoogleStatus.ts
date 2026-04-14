// Re-export so callers can `import { useGoogleStatus } from './hooks/useGoogleStatus'`
// and match the conventional per-hook file naming used by useWorkOrders, etc.
// The actual implementation lives in GoogleStatusContext.tsx because the hook
// and its Provider are tightly coupled.
export { useGoogleStatus, GoogleStatusProvider } from './GoogleStatusContext'
