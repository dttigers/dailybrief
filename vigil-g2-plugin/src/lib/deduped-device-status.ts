import type { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'

/**
 * Phase 125 (G2-POLISH-08 / D-12): dedupe consecutive device-status events
 * with the same connectType. Defends against SDK noise (HARDWARE-DIVERGENCE.md
 * Divergence 6 — repeated `connectType: "none"` emissions).
 *
 * Returns a wrapped callback that fires the inner callback only when
 * status.connectType differs from the last-seen value.
 *
 * D-12: helper ships in v3.8 with no live consumer. First consumer (likely
 * a "glasses disconnected" indicator separate from the SSE-network offline
 * indicator) is a v3.9+ candidate.
 */
export function createDedupedDeviceStatusListener(
  callback: (status: DeviceStatus) => void,
): (status: DeviceStatus) => void {
  let lastSeenConnectType: DeviceConnectType | null = null
  return (status: DeviceStatus) => {
    if (status.connectType === lastSeenConnectType) return
    lastSeenConnectType = status.connectType
    callback(status)
  }
}
