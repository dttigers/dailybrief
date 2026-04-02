# Plan 05-03 Summary

## Outcome
Completed with design changes from original plan.

## What Changed
- **CaptureView**: Reverted to text-only. Floating panel NSOpenPanel conflicts made multi-mode capture impractical.
- **Audio/Image import**: Moved to dashboard toolbar buttons. Regular NSWindow has no panel-level conflicts.
- **WhisperKit → SFSpeechRecognizer**: WhisperKit crashes on Intel Macs (MLMultiArray allocation segfault in x86_64). Replaced with Apple's built-in Speech framework.
- **Image compression**: Auto-compresses images over 5MB (Claude API limit) via progressive JPEG quality reduction + downscaling.
- **FilePicker**: Renamed ImagePicker → FilePicker with shared pickFile() method supporting audio (.wav, .mp3, .m4a, .aiff) and image formats.

## Commits
- `0310043`: feat(05-03): move audio/image import to dashboard, replace WhisperKit with SFSpeechRecognizer

## Tasks
| # | Task | Status |
|---|------|--------|
| 1 | Add capture mode UI to CaptureView | Done (then reverted — moved to dashboard) |
| 2 | Wire services in AppDelegate | Done (then simplified — dashboard handles imports) |
| 3 | Human verification | Approved after iterating on design |

## Decisions
- 05-03: CapturePanel text-only; audio/image import via dashboard toolbar (floating panel + NSOpenPanel incompatible)
- 05-03: SFSpeechRecognizer over WhisperKit (Intel Mac CoreML crash, no model downloads needed)
- 05-03: Auto-compress images >5MB via progressive JPEG quality + 50% downscale fallback
- 05-03: FilePicker replaces ImagePicker (shared pickFile with type-specific convenience methods)
- 05-03: WhisperKit dependency removed from Package.swift

## Duration
~25 min (including debugging WhisperKit crashes and NSOpenPanel issues)
