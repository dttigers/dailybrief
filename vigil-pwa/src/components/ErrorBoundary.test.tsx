import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'
import * as posthog from '../analytics/posthog'

// A component that throws on render
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('test render error')
  return <div>OK</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Suppress React's console.error output for caught errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('shows fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('calls captureException with boundary=root when child throws', () => {
    const spy = vi.spyOn(posthog, 'captureException').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(spy).toHaveBeenCalledWith(expect.any(Error), { boundary: 'root' })
  })
})
