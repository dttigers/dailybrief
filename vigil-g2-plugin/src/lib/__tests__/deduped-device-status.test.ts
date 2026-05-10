// Phase 125 Plan 04 — GREEN tests for G2-POLISH-08 dedupe helper.
//
// Replaces Plan 01 RED placeholders. Pinned by 125-RESEARCH.md §Example D
// (lines 758-828) + D-12 (helper-only ship; no live consumer this phase).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDedupedDeviceStatusListener } from '../deduped-device-status.ts'
import { DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { DeviceStatus } from '@evenrealities/even_hub_sdk'

function makeStatus(connectType: DeviceConnectType): DeviceStatus {
  return { sn: 'TEST', connectType } as DeviceStatus
}

test('createDedupedDeviceStatusListener — 5×"none" fires once', () => {
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener((s) => calls.push(s.connectType))
  for (let i = 0; i < 5; i++) listener(makeStatus(DeviceConnectType.None))
  assert.deepEqual(calls, [DeviceConnectType.None])
})

test('createDedupedDeviceStatusListener — change fires; consecutive same is deduped', () => {
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener((s) => calls.push(s.connectType))
  listener(makeStatus(DeviceConnectType.None))
  listener(makeStatus(DeviceConnectType.None))
  listener(makeStatus(DeviceConnectType.Connecting))
  listener(makeStatus(DeviceConnectType.Connected))
  listener(makeStatus(DeviceConnectType.Connected))
  listener(makeStatus(DeviceConnectType.Disconnected))
  assert.deepEqual(calls, [
    DeviceConnectType.None,
    DeviceConnectType.Connecting,
    DeviceConnectType.Connected,
    DeviceConnectType.Disconnected,
  ])
})

test('createDedupedDeviceStatusListener — first call always fires (lastSeen starts null)', () => {
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener((s) => calls.push(s.connectType))
  listener(makeStatus(DeviceConnectType.Connected))
  assert.deepEqual(calls, [DeviceConnectType.Connected])
})
