import { describe, it, expect } from 'vitest'

describe('Layout', () => {
  describe('gear', () => {
    it('renders red status dot when google status has needs_auth scope', () => {
      expect.fail('Plan 05: gear icon + status dot not yet implemented')
    })
    it('does NOT render red dot when both scopes connected', () => {
      expect.fail('Plan 05: gear dot hide-when-connected not yet implemented')
    })
    it('renders red dot when status is null (never connected)', () => {
      expect.fail('Plan 05: gear dot for null status not yet implemented')
    })
  })
})
