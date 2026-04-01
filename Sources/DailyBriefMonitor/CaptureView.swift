import SwiftUI

/// SwiftUI view for capturing a quick thought — text input with Cmd+Enter submit.
struct CaptureView: View {

    @State private var text = ""
    @State private var isSaving = false
    @State private var showSuccess = false
    @State private var errorMessage: String?
    @FocusState private var isTextFocused: Bool

    /// Called when the user submits text. Decoupled from CaptureService for testability.
    var onCapture: (String) async throws -> Void

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

            if showSuccess {
                Text("Captured!")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.green.opacity(0.9))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .transition(.opacity)
            }
        }
        .onAppear {
            isTextFocused = true
        }
        .onExitCommand {
            onDismiss()
        }
    }

    private func performCapture() {
        guard !isSaving else { return }
        isSaving = true
        errorMessage = nil

        Task {
            do {
                try await onCapture(text)
                withAnimation {
                    showSuccess = true
                }
                try? await Task.sleep(for: .milliseconds(400))
                text = ""
                showSuccess = false
                onDismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}
