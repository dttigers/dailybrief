import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Single-slot toast primitive for Phase 101.
 *
 * Contract (Phase 101 Plan 01, derived from D-15/D-16/D-17):
 * - At most one toast is visible at a time.
 * - `showToast()` auto-dismisses after TOAST_DURATION_MS (5s, D-15).
 * - Calling `showToast()` while one is visible fires the previous toast's
 *   `onExpire` SYNCHRONOUSLY before replacing it (D-16). This is how the
 *   deferred-commit delete flow becomes permanent when the user triggers a
 *   second delete before the first 5s window elapses.
 * - `dismiss()` clears the current toast immediately and does NOT fire
 *   `onExpire` — only the auto-dismiss timer fires it (that's the "5s elapsed
 *   → commit" signal). Manual dismiss = user took action, no commit needed.
 *
 * Consumers: ToastHost (renderer), ThoughtsPage (delete-with-undo in Plan 03).
 */

export interface Toast {
  id: number
  body: string
  action?: string
  onAction?: () => void
  onExpire?: () => void
  variant: 'default' | 'error'
}

export interface ToastContextValue {
  current: Toast | null
  showToast: (t: Omit<Toast, 'id'>) => void
  dismiss: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 5_000 // D-15

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const timerRef = useRef<number | null>(null)
  const expireRef = useRef<(() => void) | undefined>(undefined)
  const idRef = useRef(0)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const dismiss = useCallback(() => {
    clearTimer()
    // D-16 inverse: manual dismiss MUST NOT fire onExpire. Only the auto-dismiss
    // timer fires onExpire (that's the "5 seconds elapsed → commit" signal).
    expireRef.current = undefined
    setCurrent(null)
  }, [])

  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    // D-16: if a toast is currently shown, fire its onExpire synchronously
    // BEFORE replacing. This is how deferred-commit deletes become permanent
    // when the user triggers a second delete before the first 5s expires.
    if (expireRef.current) {
      const prev = expireRef.current
      expireRef.current = undefined
      prev()
    }
    clearTimer()

    const id = ++idRef.current
    const next: Toast = { ...t, id }
    expireRef.current = t.onExpire
    setCurrent(next)
    timerRef.current = window.setTimeout(() => {
      const fn = expireRef.current
      expireRef.current = undefined
      if (fn) fn()
      setCurrent((c) => (c?.id === id ? null : c))
    }, TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ current, showToast, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
