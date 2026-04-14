import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Layout from './Layout'
import { GoogleStatusProvider } from '../hooks/GoogleStatusContext'

function renderLayoutWithStatus(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  return render(
    <MemoryRouter>
      <GoogleStatusProvider>
        <Layout>
          <div />
        </Layout>
      </GoogleStatusProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Layout', () => {
  describe('gear', () => {
    it('renders red status dot when google status has needs_auth scope', async () => {
      renderLayoutWithStatus(
        async () =>
          new Response(
            JSON.stringify({ calendar: 'connected', gmail: 'needs_auth' }),
            { status: 200 },
          ),
      )
      const dot = await screen.findByTestId('google-status-dot')
      expect(dot).toBeInTheDocument()
    })

    it('does NOT render red dot when both scopes connected', async () => {
      renderLayoutWithStatus(
        async () =>
          new Response(
            JSON.stringify({ calendar: 'connected', gmail: 'connected' }),
            { status: 200 },
          ),
      )
      // allow provider effect to settle
      await screen.findByLabelText('Settings')
      // wait a tick for status to propagate
      await new Promise((r) => setTimeout(r, 10))
      expect(screen.queryByTestId('google-status-dot')).not.toBeInTheDocument()
    })

    it('renders red dot when status is null (never connected)', async () => {
      renderLayoutWithStatus(async () => new Response(null, { status: 404 }))
      const dot = await screen.findByTestId('google-status-dot')
      expect(dot).toBeInTheDocument()
    })
  })
})
