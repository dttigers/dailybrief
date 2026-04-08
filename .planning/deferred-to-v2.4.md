# Items deferred from v2.3 → v2.4

**Deferred on:** 2026-04-08 during v2.3 milestone completion
**Why:** v2.3 scope-slipped toward infrastructure (phases 55-57 were promoted mid-milestone from the backlog) and Smart Photo Upload was never started. Moving cleanly rather than shipping a partial milestone.

**Action for `/gsd-new-milestone v2.4`:** fold the phase definition and the 6 requirements below into the v2.4 requirements gathering + roadmap generation.

---

## Phase 54: Smart Photo Upload (verbatim from v2.3 ROADMAP.md before archival)

**Goal:** Uploading a photo of handwritten notes produces verbatim, correctly-split thoughts based on the paper type, with user control over the detection

**Depends on:** Phase 52 (Projects Backend — shipped in v2.3, so the dependency is already satisfied when v2.4 starts)

**Requirements:** PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04, PHOTO-05, PHOTO-06

**Success Criteria (what must be TRUE):**
1. Uploading a photo automatically detects whether the paper is lined or gridded before creating any thoughts
2. A lined-paper photo produces multiple separate thoughts — one per distinct line, bullet, or paragraph — with verbatim handwriting transcription
3. A gridded-paper photo produces a single thought with verbatim handwriting transcription
4. The Mac app upload UI offers a paper-type override (force "lined" or "gridded") that takes precedence over the auto-detection
5. When detection confidence is low, the system falls back to the user-configured default and the UI surfaces a warning that detection was uncertain

**Plans:** TBD (never planned in v2.3)

---

## PHOTO-XX requirements (verbatim from v2.3 REQUIREMENTS.md before archival)

Copy these into v2.4 REQUIREMENTS.md during `/gsd-new-milestone`. All six are `[ ]` (unchecked) — none were partially implemented.

- [ ] **PHOTO-01**: System detects whether an uploaded photo is lined paper or gridded paper before extracting content
- [ ] **PHOTO-02**: Lined-paper photos are split into multiple separate thoughts, one per distinct line/bullet/paragraph
- [ ] **PHOTO-03**: Gridded-paper photos are kept as a single thought, eligible for assignment to a project
- [ ] **PHOTO-04**: Both modes produce verbatim transcriptions of the actual handwriting — no third-person paraphrase, no editorial summary
- [ ] **PHOTO-05**: User can override the detected paper type before the thoughts are committed (force "lined" or "gridded")
- [ ] **PHOTO-06**: If paper type can't be confidently detected, system falls back to a user-configurable default and surfaces the uncertainty in the UI

### Traceability (from v2.3 REQUIREMENTS.md)
| REQ-ID | Phase (v2.3) | Status (v2.3 end) |
|---|---|---|
| PHOTO-01 | Phase 54 | Deferred to v2.4 (never started) |
| PHOTO-02 | Phase 54 | Deferred to v2.4 (never started) |
| PHOTO-03 | Phase 54 | Deferred to v2.4 (never started) |
| PHOTO-04 | Phase 54 | Deferred to v2.4 (never started) |
| PHOTO-05 | Phase 54 | Deferred to v2.4 (never started) |
| PHOTO-06 | Phase 54 | Deferred to v2.4 (never started) |

---

*This file is read by `/gsd-new-milestone` during v2.4 setup. Delete it after the v2.4 requirements + roadmap have absorbed these items.*
