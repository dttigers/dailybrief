import SwiftUI
import JarvisCore

// MARK: - ThoughtCategory UI Extension

extension ThoughtCategory {
    /// Display color for the category pill in the capture UI.
    var displayColor: Color {
        switch self {
        case .task: return .blue
        case .therapy: return .purple
        case .idea: return .orange
        case .reflection: return .green
        case .project: return .indigo
        }
    }

    /// Capitalized display name.
    var displayName: String {
        rawValue.capitalized
    }
}

// MARK: - CaptureView

/// SwiftUI view for capturing a quick thought — text input with Cmd+Enter submit.
struct CaptureView: View {

    @State private var text = ""
    @State private var isSaving = false
    @State private var showSuccess = false
    @State private var isTriaging = false
    @State private var triageResult: TriageResult?
    @State private var capturedThoughtId: Int64?
    @State private var selectedCategory: ThoughtCategory?
    @State private var showCategoryPicker = false
    @State private var errorMessage: String?
    @State private var dismissTask: Task<Void, Never>?
    @FocusState private var isTextFocused: Bool

    /// Called when the user submits text. Returns the saved Thought.
    var onCapture: (String) async throws -> Thought

    /// Called after capture to triage the thought content. Takes (thoughtId, content), persists result, returns it.
    var onTriage: ((Int64, String) async -> TriageResult?)?

    /// Called when the user overrides the AI-assigned category.
    var onOverride: ((Int64, ThoughtCategory) async -> Void)?

    /// Called when the panel should dismiss (Escape or after successful capture).
    var onDismiss: () -> Void

    var body: some View {
        ZStack {
            VStack(spacing: 12) {
                TextEditor(text: $text)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                    )
                    .frame(minHeight: 80)
                    .focused($isTextFocused)

                HStack {
                    Text("\(text.count) characters")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    Button("Capture") {
                        performCapture()
                    }
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .padding(12)

            // Overlay states: success, triaging, or triage result
            if showSuccess && !isTriaging && triageResult == nil {
                Text("Captured!")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.green.opacity(0.9))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .transition(.opacity)
            }

            if isTriaging {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Categorizing...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .transition(.opacity)
            }

            if let result = triageResult {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        // Category pill — tappable for override
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showCategoryPicker.toggle()
                            }
                        } label: {
                            let category = selectedCategory ?? result.category
                            Text(category.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(category.displayColor.opacity(0.9))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)

                        // Confidence percentage
                        let confidence = selectedCategory != nil ? 1.0 : result.confidence
                        Text("\(Int(confidence * 100))%")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    // Category picker row
                    if showCategoryPicker {
                        HStack(spacing: 6) {
                            ForEach(ThoughtCategory.allCases, id: \.self) { category in
                                Button {
                                    selectCategory(category)
                                } label: {
                                    Text(category.displayName)
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(category.displayColor.opacity(
                                            (selectedCategory ?? triageResult?.category) == category ? 0.9 : 0.4
                                        ))
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .transition(.opacity)
            }
        }
        .onAppear {
            isTextFocused = true
        }
        .onExitCommand {
            cancelDismissTimer()
            onDismiss()
        }
    }

    private func performCapture() {
        guard !isSaving else { return }
        isSaving = true
        errorMessage = nil

        Task {
            do {
                let thought = try await onCapture(text)
                capturedThoughtId = thought.id

                // Show "Captured!" briefly
                withAnimation {
                    showSuccess = true
                }
                try? await Task.sleep(for: .milliseconds(200))

                // Attempt triage if available
                if let onTriage {
                    withAnimation {
                        showSuccess = false
                        isTriaging = true
                    }

                    let result = await onTriage(thought.id!, text)

                    withAnimation {
                        isTriaging = false
                    }

                    if let result {
                        withAnimation {
                            triageResult = result
                        }
                        text = ""
                        isSaving = false

                        // Auto-dismiss after 1.5s
                        scheduleDismiss()
                        return
                    }
                }

                // No triage or triage failed — dismiss normally
                text = ""
                withAnimation {
                    showSuccess = false
                }
                onDismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }

    private func selectCategory(_ category: ThoughtCategory) {
        let previousCategory = selectedCategory ?? triageResult?.category
        guard category != previousCategory else { return }

        selectedCategory = category

        // Persist override
        if let thoughtId = capturedThoughtId {
            Task {
                await onOverride?(thoughtId, category)
            }
        }

        // Reset auto-dismiss timer to give user time to see change
        scheduleDismiss()
    }

    private func scheduleDismiss() {
        cancelDismissTimer()
        dismissTask = Task {
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            resetAndDismiss()
        }
    }

    private func cancelDismissTimer() {
        dismissTask?.cancel()
        dismissTask = nil
    }

    private func resetAndDismiss() {
        triageResult = nil
        selectedCategory = nil
        showCategoryPicker = false
        capturedThoughtId = nil
        showSuccess = false
        onDismiss()
    }
}
