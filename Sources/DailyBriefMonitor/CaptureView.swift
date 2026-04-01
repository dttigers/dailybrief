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

// MARK: - CaptureMode

/// The three capture input modes available in the capture panel.
enum CaptureMode: String, CaseIterable {
    case text, voice, image
    var label: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .text: return "text.cursor"
        case .voice: return "mic.fill"
        case .image: return "photo"
        }
    }
}

// MARK: - CaptureView

/// SwiftUI view for capturing a quick thought — text input with Cmd+Enter submit.
struct CaptureView: View {

    // MARK: - Text mode state
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

    // MARK: - Mode state
    @State private var captureMode: CaptureMode = .text

    // MARK: - Voice mode state
    @State private var isRecording = false
    @State private var recordingDuration: TimeInterval = 0
    @State private var recordingTimer: Task<Void, Never>?
    @State private var isTranscribing = false

    // MARK: - Image mode state
    @State private var selectedImageURL: URL?
    @State private var isDescribing = false

    // MARK: - Text capture closure
    /// Called when the user submits text. Returns the saved Thought.
    var onCapture: (String) async throws -> Thought

    // MARK: - Triage closures
    /// Called after capture to triage the thought content. Takes (thoughtId, content), persists result, returns it.
    var onTriage: ((Int64, String) async -> TriageResult?)?

    /// Called when the user overrides the AI-assigned category.
    var onOverride: ((Int64, ThoughtCategory) async -> Void)?

    // MARK: - Voice capture closures
    /// Called when the user taps the record button. Starts audio recording.
    var onStartRecording: (() async throws -> Void)?

    /// Called when the user taps stop. Stops recording, transcribes, saves, triages, returns Thought.
    var onStopRecording: (() async throws -> Thought)?

    // MARK: - Image capture closure
    /// Called when the user taps "Choose Image". Opens picker, describes, saves, triages, returns Thought or nil if cancelled.
    var onImageCapture: (() async throws -> Thought?)?

    /// Called when the panel should dismiss (Escape or after successful capture).
    var onDismiss: () -> Void

    var body: some View {
        ZStack {
            VStack(spacing: 12) {
                // Mode picker
                Picker("Mode", selection: $captureMode) {
                    ForEach(CaptureMode.allCases, id: \.self) { mode in
                        Label(mode.label, systemImage: mode.icon).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                // Mode-specific content
                switch captureMode {
                case .text:
                    textModeContent
                case .voice:
                    voiceModeContent
                case .image:
                    imageModeContent
                }
            }
            .padding(12)

            // Shared overlay states: success, triaging, or triage result
            overlayContent
        }
        .onAppear {
            isTextFocused = true
        }
        .onExitCommand {
            if isRecording {
                // Stop recording before dismissing
                stopRecordingAndDismiss()
            } else {
                cancelDismissTimer()
                onDismiss()
            }
        }
    }

    // MARK: - Text Mode

    private var textModeContent: some View {
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
    }

    // MARK: - Voice Mode

    private var voiceModeContent: some View {
        VStack(spacing: 16) {
            Spacer()

            // Mic / stop button
            Button {
                if isRecording {
                    performStopRecording()
                } else {
                    performStartRecording()
                }
            } label: {
                Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                    .resizable()
                    .frame(width: 60, height: 60)
                    .foregroundStyle(isRecording ? .red : .accentColor)
            }
            .buttonStyle(.plain)
            .disabled(onStartRecording == nil || isTranscribing)
            .keyboardShortcut(.return, modifiers: .command)

            // Duration label
            Text(formattedDuration(recordingDuration))
                .font(.title2.monospacedDigit())
                .foregroundStyle(isRecording ? .primary : .secondary)

            // Status text
            Group {
                if isTranscribing {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        Text("Transcribing...")
                    }
                } else if isRecording {
                    Text("Recording...")
                        .foregroundStyle(.red)
                } else if onStartRecording == nil {
                    Text("Voice capture unavailable")
                        .foregroundStyle(.secondary)
                } else {
                    Text("Tap to record")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.subheadline)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Spacer()
        }
        .frame(minHeight: 80)
    }

    // MARK: - Image Mode

    private var imageModeContent: some View {
        VStack(spacing: 16) {
            Spacer()

            // Choose image button
            Button {
                performImageCapture()
            } label: {
                Label("Choose Image", systemImage: "photo")
                    .font(.headline)
            }
            .disabled(onImageCapture == nil || isDescribing)

            // Selected file label
            if let url = selectedImageURL {
                Text(url.lastPathComponent)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            // Describing status
            if isDescribing {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Analyzing image...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if onImageCapture == nil {
                Text("Image capture unavailable")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Spacer()
        }
        .frame(minHeight: 80)
    }

    // MARK: - Shared Overlay

    @ViewBuilder
    private var overlayContent: some View {
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
                        if showCategoryPicker {
                            cancelDismissTimer()
                        } else {
                            scheduleDismiss()
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

    // MARK: - Text Capture

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

                        // Auto-dismiss after 2.5s
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

    // MARK: - Voice Capture

    private func performStartRecording() {
        guard let onStartRecording else { return }
        errorMessage = nil
        recordingDuration = 0

        Task {
            do {
                try await onStartRecording()
                isRecording = true
                startDurationTimer()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func performStopRecording() {
        guard let onStopRecording else { return }
        isRecording = false
        cancelDurationTimer()
        errorMessage = nil
        isTranscribing = true

        Task {
            do {
                let thought = try await onStopRecording()
                capturedThoughtId = thought.id
                isTranscribing = false

                withAnimation {
                    triageResult = thought.category.map {
                        TriageResult(category: $0, confidence: thought.confidence ?? 0.5)
                    }
                }

                if triageResult != nil {
                    scheduleDismiss()
                } else {
                    // Show brief success then dismiss
                    withAnimation { showSuccess = true }
                    try? await Task.sleep(for: .milliseconds(800))
                    withAnimation { showSuccess = false }
                    onDismiss()
                }
            } catch {
                isTranscribing = false
                errorMessage = error.localizedDescription
            }
        }
    }

    private func stopRecordingAndDismiss() {
        isRecording = false
        cancelDurationTimer()
        // Fire and forget — just stop recording, don't transcribe
        if let onStopRecording {
            Task {
                _ = try? await onStopRecording()
            }
        }
        cancelDismissTimer()
        onDismiss()
    }

    private func startDurationTimer() {
        recordingTimer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled else { return }
                recordingDuration += 0.1
            }
        }
    }

    private func cancelDurationTimer() {
        recordingTimer?.cancel()
        recordingTimer = nil
    }

    private func formattedDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return "\(minutes):\(String(format: "%02d", seconds))"
    }

    // MARK: - Image Capture

    private func performImageCapture() {
        guard let onImageCapture else { return }
        errorMessage = nil
        isDescribing = true

        Task {
            do {
                let thought = try await onImageCapture()
                isDescribing = false

                guard let thought else {
                    // User cancelled picker
                    return
                }

                capturedThoughtId = thought.id

                withAnimation {
                    triageResult = thought.category.map {
                        TriageResult(category: $0, confidence: thought.confidence ?? 0.5)
                    }
                }

                if triageResult != nil {
                    scheduleDismiss()
                } else {
                    withAnimation { showSuccess = true }
                    try? await Task.sleep(for: .milliseconds(800))
                    withAnimation { showSuccess = false }
                    onDismiss()
                }
            } catch {
                isDescribing = false
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Category Override

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

    // MARK: - Dismiss Helpers

    private func scheduleDismiss() {
        cancelDismissTimer()
        dismissTask = Task {
            try? await Task.sleep(for: .milliseconds(2500))
            guard !Task.isCancelled, !showCategoryPicker else { return }
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
        recordingDuration = 0
        selectedImageURL = nil
        onDismiss()
    }
}
