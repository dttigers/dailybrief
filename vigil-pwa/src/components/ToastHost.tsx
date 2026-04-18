import { createPortal } from 'react-dom'
import { useToast } from '../hooks/useToast'

/**
 * Single-slot toast renderer, portaled to document.body so it survives page
 * route transitions (Pitfall 7 in 101-RESEARCH).
 *
 * Rendering rules locked by 101-UI-SPEC:
 * - Default variant → role="status" + aria-live="polite"
 * - Error variant   → role="alert"  + aria-live="assertive"
 * - Position: fixed bottom with safe-area-inset awareness (xl / 2rem)
 * - Surface: bg-gray-900/80 + gray-400/30 border, rounded-lg, shadow-xl
 * - Action button: text-teal-400 (only accent in phase), min 44px hit target
 * - z-index 60 — one above BulkActionBar (z-50) so Undo always sits above
 *
 * Dismiss-on-action ordering: onAction() FIRES FIRST, then dismiss(). The
 * Wave 0 test asserts both onAction was called AND toast is gone.
 */
export default function ToastHost() {
  const { current, dismiss } = useToast()
  if (!current) return null

  const isError = current.variant === 'error'

  return createPortal(
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed left-1/2 -translate-x-1/2 z-[60] bg-gray-900/80 border border-gray-400/30 rounded-lg shadow-xl px-4 py-3 flex items-center gap-4 min-w-[240px] max-w-[90vw] text-sm font-normal text-gray-50 transition-all duration-150"
      style={{ bottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <span>{current.body}</span>
      {current.action && (
        <button
          type="button"
          onClick={() => {
            current.onAction?.()
            dismiss()
          }}
          className="text-sm font-medium text-teal-400 hover:text-teal-100 transition-colors min-w-[44px] text-center"
        >
          {current.action}
        </button>
      )}
    </div>,
    document.body,
  )
}
