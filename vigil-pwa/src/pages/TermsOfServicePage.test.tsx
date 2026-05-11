// ── Phase 126 Wave 0 — RED-by-default scaffold (AUTH-126-06 / Plan 126-10) ───
// Pins the existence + minimal shape of vigil-pwa/src/pages/TermsOfServicePage.tsx
// BEFORE Wave 1 (Plan 126-10) creates the page. Until then both tests below
// fail at module resolution. That is the intended RED state.
//
// Test cases:
//   - AUTH-126-TERMS-RENDERS: rendered output contains substring "terms" (case-insensitive)
//   - AUTH-126-TERMS-HEADING: at least one heading element is present
//
// Router convention (vigil-pwa/package.json line 17): vigil-pwa uses
// `react-router` v7 (single-package namespace).
//
// Run: cd vigil-pwa && npx vitest run src/pages/TermsOfServicePage.test.tsx
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// The `./TermsOfServicePage` module does NOT exist yet — Plan 126-10 creates it.
// This import failure IS the Wave 0 RED signal for this file.
import TermsOfServicePage from './TermsOfServicePage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/legal/terms']}>
      <TermsOfServicePage />
    </MemoryRouter>,
  )
}

describe('TermsOfServicePage — AUTH-126-06', () => {
  it('AUTH-126-TERMS-RENDERS: rendered body contains substring "terms" (case-insensitive)', () => {
    const { container } = renderPage()
    expect(container.textContent?.toLowerCase() ?? '').toContain('terms')
  })

  it('AUTH-126-TERMS-HEADING: at least one heading (h1/h2/h3) is present', () => {
    renderPage()
    const headings = screen.getAllByRole('heading')
    expect(headings.length).toBeGreaterThan(0)
  })
})
