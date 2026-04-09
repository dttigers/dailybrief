import AppKit
import Foundation
import JarvisCore
import SwiftUI

// MARK: - Photo Preview State Machine (Phase 60 Plan 02)
//
// These types live here (alongside the view that renders them) rather than
// inside DashboardViewModel because both the view-model and the view need to
// see them, and the view-model is already large. Keeping them next to the
// view also makes their "this is UI-tier state" intent explicit.
//
// The state machine is the D-10 test target — see
// Tests/DailyBriefMonitorTests/DashboardViewModelPhotoPreviewTests.swift.

/// The mutable content shown in the preview sheet for one in-flight photo.
///
/// This is a value type (not a reference type) so view-model transitions are
/// an atomic `photoPreviewState = .awaitingUserDecision(updatedPayload)`
/// assignment instead of a sequence of property mutations that could
/// interleave with SwiftUI's dependency tracking.
struct PhotoPreviewPayload: Equatable, Identifiable {
    let fileURL: URL
    let indexInBatch: Int          // zero-based
    let totalInBatch: Int
    /// What the backend originally reported on the FIRST preview call for this photo.
    /// Used by the uncertainty banner subtitle + the "no sticky override" assertion.
    let detectedPaperType: PaperType
    /// The confidence reported on the FIRST preview call (not the refetch).
    let confidence: Double
    /// Content strings, read-only. Refreshed on override via a second preview call.
    var thoughts: [String]
    /// The paper type currently selected in the segmented picker — this is what
    /// would be sent as `forcePaperType` on commit (if it differs from detected).
    var currentForcePaperType: PaperType
    /// True iff the original confidence was below 0.5 — drives the yellow banner.
    let showUncertaintyBanner: Bool
    /// The user's Settings default at the time this payload was constructed.
    /// Used by the banner text so the user knows which default was applied.
    let userDefaultPaperType: PaperType
    /// True while an override refetch or the commit call is in flight.
    /// Disables the picker + buttons to prevent picker-toggle DoS (T-60-16).
    var isBusy: Bool

    /// Stable identity so `.sheet(item:)` can swap payloads between photos
    /// without a dismiss/re-present race.
    var id: String { "\(fileURL.path)#\(indexInBatch)" }
}

/// Top-level state for the photo preview flow on DashboardViewModel.
/// `nil` means idle — no preview sheet presented.
///
/// The flow is intentionally simple: `awaitingUserDecision` is the ONLY state
/// where the sheet is visible. Analyzing + committing are handled via the
/// existing `importProgress` banner on the dashboard, not by a sheet.
enum PhotoPreviewState: Identifiable, Equatable {
    case awaitingUserDecision(PhotoPreviewPayload)

    var id: String {
        switch self {
        case .awaitingUserDecision(let p): return p.id
        }
    }

    var payload: PhotoPreviewPayload {
        switch self {
        case .awaitingUserDecision(let p): return p
        }
    }
}

// MARK: - Sheet View

/// The modal sheet shown between "Analyzing photo.jpg (N/M)" and the commit.
///
/// Receives three callbacks (commit / cancel / override) rather than an
/// `@ObservedObject` reference to the view-model so the state machine stays
/// unit-testable without SwiftUI attached. The parent wires the callbacks to
/// DashboardViewModel methods in DashboardView.swift.
struct PhotoPreviewSheet: View {
    let payload: PhotoPreviewPayload
    let onCommit: () -> Void
    let onCancel: () -> Void
    let onOverride: (PaperType) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            if payload.showUncertaintyBanner {
                uncertaintyBanner
            }

            paperTypeRow

            Divider()

            thoughtsList

            Divider()

            buttonRow
        }
        .padding(16)
        .frame(minWidth: 480, minHeight: 520)
    }

    // MARK: - Subviews

    private var header: some View {
        HStack {
            Text("Preview photo \(payload.indexInBatch + 1) of \(payload.totalInBatch)")
                .font(.headline)
            Spacer()
            Text(payload.fileURL.lastPathComponent)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }

    /// Yellow uncertainty banner — reuses the `.controlBackgroundColor` pattern
    /// from DashboardView.swift lines 629–693 for visual consistency with the
    /// existing import progress + failed-file banners.
    private var uncertaintyBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text("Paper type uncertain — using your default: \(payload.userDefaultPaperType.displayName)")
                .font(.subheadline)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private var paperTypeRow: some View {
        HStack(spacing: 16) {
            Picker("Paper type", selection: Binding(
                get: { payload.currentForcePaperType },
                set: { newValue in
                    if newValue != payload.currentForcePaperType {
                        onOverride(newValue)
                    }
                }
            )) {
                Text("Lined").tag(PaperType.lined)
                Text("Gridded").tag(PaperType.gridded)
            }
            .pickerStyle(.segmented)
            .disabled(payload.isBusy)
            .labelsHidden()

            Text(String(format: "confidence: %.2f", payload.confidence))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var thoughtsList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                if payload.thoughts.isEmpty {
                    Text("No thoughts detected")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(Array(payload.thoughts.enumerated()), id: \.offset) { _, content in
                        // Read-only row. NO tap handler, NO delete swipe,
                        // no editable surfaces — 60-CONTEXT.md D-02.
                        Text(content)
                            .font(.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color(nsColor: .textBackgroundColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                            )
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .frame(minHeight: 200)
    }

    private var buttonRow: some View {
        HStack {
            Spacer()
            Button("Cancel", role: .cancel) { onCancel() }
                .keyboardShortcut(.cancelAction)
                .disabled(payload.isBusy)

            Button("Commit") { onCommit() }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(payload.isBusy)
        }
    }
}
