import Foundation

/// State of the update flow. Drives the menu bar button label and status row.
/// Label mappings (per D-10):
///   .idle           → button label: "Update Vigil"
///   .running        → button label: "Updating…", disabled
///   .upToDate       → button label: "✓ Up to date"
///   .updated(sha)   → button label: "✓ Updated to {sha}"
///   .failed(tail)   → button label: "✗ Build failed"  + tail shown in dropdown
enum UpdateStatus: Equatable {
    case idle
    case running
    case upToDate
    case updated(sha: String)
    case failed(tail: String)
}
