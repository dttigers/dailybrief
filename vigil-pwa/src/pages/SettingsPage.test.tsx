import { describe, it, expect } from 'vitest'

describe('SettingsPage', () => {
  describe('empty', () => {
    it('renders Connect Google button when status is null', () => {
      // Plan 06 will import SettingsPage, mock GoogleStatusContext with status=null,
      // and assert getByRole('button', { name: /connect google/i })
      expect.fail('Plan 06: SettingsPage empty state not yet implemented')
    })
  })

  describe('connected', () => {
    it('renders both scope rows as connected when calendar+gmail both connected', () => {
      expect.fail('Plan 06: connected state not yet implemented')
    })
  })

  describe('scope gap', () => {
    it('renders per-row Re-connect button on Gmail when gmail=needs_auth', () => {
      expect.fail('Plan 06: scope gap state not yet implemented')
    })
  })

  describe('disconnect', () => {
    it('inline confirm: click Disconnect → Confirm → calls disconnectGoogle()', () => {
      expect.fail('Plan 06: inline disconnect confirm not yet implemented')
    })
  })

  describe('callback', () => {
    it('shows success banner and calls replaceState when ?google_connected=true', () => {
      expect.fail('Plan 06: callback banner not yet implemented')
    })
    it('shows error banner with decoded message when ?google_error=invalid_state', () => {
      expect.fail('Plan 06: error banner not yet implemented')
    })
  })
})
