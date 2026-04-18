import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, act } from '@testing-library/react'
import { useEffect } from 'react'
import ToastHost from './ToastHost'
import { ToastProvider, useToast } from '../hooks/useToast'

// Harness: exposes showToast to the test via a callback so tests can trigger
// toasts imperatively. Lives inside ToastProvider so the hook resolves.
function Harness({
  onReady,
}: {
  onReady: (show: ReturnType<typeof useToast>['showToast']) => void
}) {
  const { showToast } = useToast()
  useEffect(() => {
    onReady(showToast)
  }, [onReady, showToast])
  return null
}

function renderHost() {
  let show: ReturnType<typeof useToast>['showToast'] | null = null
  render(
    <ToastProvider>
      <Harness
        onReady={(s) => {
          show = s
        }}
      />
      <ToastHost />
    </ToastProvider>,
  )
  if (!show) throw new Error('showToast not captured by harness')
  return show as ReturnType<typeof useToast>['showToast']
}

describe('ToastHost', () => {
  it('renders nothing when no toast is current', () => {
    render(
      <ToastProvider>
        <ToastHost />
      </ToastProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders role="status" with aria-live="polite" for default variant (UI-SPEC)', () => {
    const show = renderHost()
    act(() => {
      show({ body: 'Thought deleted.', variant: 'default' })
    })
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
  })

  it('renders role="alert" with aria-live="assertive" for error variant', () => {
    const show = renderHost()
    act(() => {
      show({ body: "Couldn't delete. Try again.", variant: 'error' })
    })
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('aria-live')).toBe('assertive')
  })

  it('renders body text', () => {
    const show = renderHost()
    act(() => {
      show({ body: 'Thought deleted.', variant: 'default' })
    })
    expect(screen.getByText('Thought deleted.')).toBeTruthy()
  })

  it('renders action button when action provided (text-teal-400 per UI-SPEC)', () => {
    const show = renderHost()
    act(() => {
      show({
        body: 'Thought deleted.',
        action: 'Undo',
        onAction: vi.fn(),
        variant: 'default',
      })
    })
    const btn = screen.getByRole('button', { name: 'Undo' })
    expect(btn).toBeTruthy()
    expect(btn.className).toMatch(/text-teal-400/)
  })

  it('action click calls onAction and dismisses', () => {
    const show = renderHost()
    const onAction = vi.fn()
    act(() => {
      show({
        body: 'Thought deleted.',
        action: 'Undo',
        onAction,
        variant: 'default',
      })
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not render action button when action absent', () => {
    const show = renderHost()
    act(() => {
      show({ body: 'Thought deleted.', variant: 'default' })
    })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mounts at fixed bottom position (UI-SPEC Spacing xl + safe area)', () => {
    const show = renderHost()
    act(() => {
      show({ body: 'Thought deleted.', variant: 'default' })
    })
    const status = screen.getByRole('status')
    const hasBottomToken =
      /\bbottom-\S+/.test(status.className) ||
      status.style.bottom !== ''
    expect(hasBottomToken).toBe(true)
  })
})
