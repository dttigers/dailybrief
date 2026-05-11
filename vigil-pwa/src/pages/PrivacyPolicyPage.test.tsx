// ── Phase 126 Wave 0 — RED-by-default scaffold (AUTH-126-06 / Plan 126-10) ───
// Pins the existence + minimal shape of vigil-pwa/src/pages/PrivacyPolicyPage.tsx
// BEFORE Wave 1 (Plan 126-10) creates the page. Until then both tests below
// fail at module resolution. That is the intended RED state.
//
// Test cases:
//   - AUTH-126-PRIVACY-RENDERS: rendered output contains substring "privacy" (case-insensitive)
//   - AUTH-126-PRIVACY-HEADING: at least one heading element is present
//
// Router convention (vigil-pwa/package.json line 17): vigil-pwa uses
// `react-router` v7 (single-package namespace). AuthPage.tsx:2 +
// ForgotPasswordPage.test.tsx:3 establish this import shape.
//
// Run: cd vigil-pwa && npx vitest run src/pages/PrivacyPolicyPage.test.tsx
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// The `./PrivacyPolicyPage` module does NOT exist yet — Plan 126-10 creates it.
// This import failure IS the Wave 0 RED signal for this file.
import PrivacyPolicyPage from './PrivacyPolicyPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/legal/privacy']}>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPolicyPage — AUTH-126-06', () => {
  it('AUTH-126-PRIVACY-RENDERS: rendered body contains substring "privacy" (case-insensitive)', () => {
    const { container } = renderPage()
    expect(container.textContent?.toLowerCase() ?? '').toContain('privacy')
  })

  it('AUTH-126-PRIVACY-HEADING: at least one heading (h1/h2/h3) is present', () => {
    renderPage()
    // getAllByRole throws if no headings — that's the RED signal we want until
    // the page is built.
    const headings = screen.getAllByRole('heading')
    expect(headings.length).toBeGreaterThan(0)
  })
})
