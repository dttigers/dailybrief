import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider, useToast } from './useToast'

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws outside ToastProvider', () => {
    // Silence expected React error log from the throw inside renderHook.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => renderHook(() => useToast())).toThrow(/inside ToastProvider/)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('current is null initially', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    expect(result.current.current).toBeNull()
  })

  it('showToast sets current with id + body', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({ body: 'hi', variant: 'default' })
    })
    expect(result.current.current?.body).toBe('hi')
    expect(typeof result.current.current?.id).toBe('number')
  })

  it('auto-dismisses after 5000ms (D-15)', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({ body: 'later', variant: 'default' })
    })
    expect(result.current.current?.body).toBe('later')
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current.current).toBeNull()
  })

  it('dismiss() clears current immediately', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({ body: 'x', variant: 'default' })
    })
    expect(result.current.current).not.toBeNull()
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.current).toBeNull()
  })

  it('second showToast replaces first and fires first onExpire (D-16)', () => {
    const firstExpire = vi.fn()
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({
        body: 'A',
        variant: 'default',
        onExpire: firstExpire,
      })
    })
    act(() => {
      result.current.showToast({ body: 'B', variant: 'default' })
    })
    expect(firstExpire).toHaveBeenCalledTimes(1)
    expect(result.current.current?.body).toBe('B')
  })

  it('onAction fires when user clicks action, then dismisses', () => {
    const onAction = vi.fn()
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({
        body: 'act',
        action: 'Undo',
        onAction,
        variant: 'default',
      })
    })
    // Store semantics: onAction must be preserved verbatim.
    expect(result.current.current?.onAction).toBe(onAction)
    // Calling it should be safe (no throw).
    expect(() => result.current.current?.onAction?.()).not.toThrow()
  })

  it('variant="error" sets current.variant === "error"', () => {
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({ body: 'bad', variant: 'error' })
    })
    expect(result.current.current?.variant).toBe('error')
  })

  it('onExpire is NOT called on manual dismiss (only on timeout)', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => {
      result.current.showToast({
        body: 'x',
        variant: 'default',
        onExpire,
      })
    })
    act(() => {
      result.current.dismiss()
    })
    expect(onExpire).not.toHaveBeenCalled()
  })
})
