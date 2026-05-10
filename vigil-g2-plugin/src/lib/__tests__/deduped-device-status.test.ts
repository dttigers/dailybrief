// Phase 125 Wave 0 — RED placeholder for G2-POLISH-08 helper.
//
// Pinned by Plan 04 (vigil-g2-plugin/src/lib/deduped-device-status.ts).
// Pattern reference: 125-RESEARCH.md §Example D (lines 758-828) + D-12.
// Plan 04 turns each test green by replacing { skip: PLAN_04 } with the
// asserted behavior body.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const PLAN_04 = 'TODO(125-04): pending implementation — vigil-g2-plugin/src/lib/deduped-device-status.ts'

test('createDedupedDeviceStatusListener — 5×"none" fires once', { skip: PLAN_04 }, () => {
  // TODO(125-04): import { createDedupedDeviceStatusListener };
  // const calls = []
  // const listener = createDedupedDeviceStatusListener(s => calls.push(s.connectType))
  // for (let i = 0; i < 5; i++) listener({ connectType: 'none', ...others })
  // assert.deepEqual(calls, ['none'])  // first call fires; consecutive same dedup'd
  assert.fail('placeholder')
})

test('createDedupedDeviceStatusListener — change fires; consecutive same is deduped', { skip: PLAN_04 }, () => {
  // TODO(125-04): per D-12 spec example:
  //   listener({connectType: 'none', ...})
  //   listener({connectType: 'none', ...})
  //   listener({connectType: 'none', ...})
  //   listener({connectType: 'connected', ...})
  // expect: calls === ['none', 'connected']
  assert.fail('placeholder')
})

test('createDedupedDeviceStatusListener — first call always fires (lastSeen starts null)', { skip: PLAN_04 }, () => {
  // TODO(125-04): brand-new listener; first call with any connectType MUST fire
  // (lastSeen ref starts at null/undefined, so first comparison always changes).
  assert.fail('placeholder')
})
