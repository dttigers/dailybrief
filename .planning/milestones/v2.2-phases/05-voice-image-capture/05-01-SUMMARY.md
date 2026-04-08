---
phase: 05-voice-image-capture
plan: 01
subsystem: audio, ai
tags: [whisperkit, avaudioengine, speech-to-text, voice-capture, on-device-ml]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: ThoughtStore, Thought model, CaptureSource enum
  - phase: 02-text-capture
    provides: CaptureService with captureText()
provides:
  - VoiceCaptureService actor (AVAudioEngine recording to WAV)
  - TranscriptionService actor (WhisperKit on-device transcription)
  - CaptureService.capture(_:source:) source-aware capture method
affects: [05-voice-image-capture, ui-integration]

# Tech tracking
tech-stack:
  added: [WhisperKit 0.9.x]
  patterns: [nonisolated(unsafe) for non-Sendable third-party types in actors, @preconcurrency import for AVFAudio Sendable compliance]

key-files:
  created:
    - Sources/JarvisCore/Services/VoiceCaptureService.swift
    - Sources/JarvisCore/Services/TranscriptionService.swift
  modified:
    - Package.swift
    - Sources/JarvisCore/Services/CaptureService.swift

key-decisions:
  - "nonisolated(unsafe) for WhisperKit property — WhisperKit is not Sendable but manages internal thread safety"
  - "@preconcurrency import AVFoundation to suppress AVAudioPCMBuffer Sendable warnings"
  - "AVAudioConverter for 16kHz mono Float32 format conversion from hardware format"

patterns-established:
  - "Voice pipeline: VoiceCaptureService (record) -> TranscriptionService (transcribe) -> CaptureService (save)"
  - "Lazy model loading: WhisperKit initialized on first transcription call"

# Metrics
duration: 8min
completed: 2026-04-01
---

# Phase 05-01: Voice Recording & Transcription Pipeline Summary

**AVAudioEngine voice capture and WhisperKit on-device transcription services with source-aware thought capture**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-01
- **Completed:** 2026-04-01
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- VoiceCaptureService actor with AVAudioEngine recording to 16kHz mono WAV files
- TranscriptionService actor with lazy-loaded WhisperKit for on-device speech-to-text
- CaptureService extended with source-aware capture(_:source:) method, backward-compatible captureText()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WhisperKit dependency + Create VoiceCaptureService actor** - `b76a194` (feat)
2. **Task 2: Create TranscriptionService actor + Extend CaptureService** - `65a80ed` (feat)

## Files Created/Modified
- `Package.swift` - Added WhisperKit SPM dependency to JarvisCore target
- `Sources/JarvisCore/Services/VoiceCaptureService.swift` - Audio recording actor with AVAudioEngine, format conversion, temp WAV output
- `Sources/JarvisCore/Services/TranscriptionService.swift` - On-device transcription actor wrapping WhisperKit with lazy model loading
- `Sources/JarvisCore/Services/CaptureService.swift` - Added capture(_:source:) method; captureText() now delegates to it

## Decisions Made
- Used `nonisolated(unsafe)` for WhisperKit property since it is not Sendable but manages internal thread safety
- Used `@preconcurrency import AVFoundation` to suppress AVAudioPCMBuffer Sendable warnings in Swift 6
- AVAudioConverter converts hardware input format to 16kHz mono Float32 for WhisperKit compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Swift 6 Sendable compliance for AVFAudio types**
- **Found during:** Task 1 (VoiceCaptureService)
- **Issue:** AVAudioPCMBuffer not Sendable, causing warnings in @Sendable closure
- **Fix:** Added `@preconcurrency import AVFoundation`
- **Files modified:** VoiceCaptureService.swift
- **Verification:** Clean build with no warnings
- **Committed in:** 65a80ed (Task 2 commit, since warning surfaced during Task 2 build)

**2. [Rule 3 - Blocking] WhisperKit not Sendable in actor context**
- **Found during:** Task 2 (TranscriptionService)
- **Issue:** Sending actor-isolated WhisperKit to nonisolated transcribe method caused data race error
- **Fix:** Used `nonisolated(unsafe)` for whisperKit property
- **Files modified:** TranscriptionService.swift
- **Verification:** Clean build with no warnings or errors
- **Committed in:** 65a80ed (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for Swift 6 strict concurrency compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Voice recording and transcription pipeline compiles and is ready for UI integration
- VoiceCaptureService, TranscriptionService, and CaptureService.capture(_:source:) are all public APIs
- Next plan can wire these services into the UI layer

---
*Phase: 05-voice-image-capture*
*Completed: 2026-04-01*
