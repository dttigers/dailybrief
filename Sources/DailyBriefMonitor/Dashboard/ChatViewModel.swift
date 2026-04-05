import Foundation
import JarvisCore

/// A single message displayed in the chat UI.
struct DisplayMessage: Identifiable {
    let id: UUID
    let role: String
    let content: String
    let timestamp: Date
}

/// View model for the AI chat panel in the dashboard.
@MainActor @Observable
final class ChatViewModel {

    // MARK: - State

    var messages: [DisplayMessage] = []
    var inputText: String = ""
    var isLoading: Bool = false
    var includeContext: Bool = true
    var error: String?

    // MARK: - Private

    private let chatService: (any ChatProviding)?

    // MARK: - Init

    init(chatService: (any ChatProviding)?) {
        self.chatService = chatService
    }

    // MARK: - Computed

    var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isLoading
            && chatService != nil
    }

    // MARK: - Actions

    func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isLoading, let chatService else { return }

        let userMessage = DisplayMessage(
            id: UUID(),
            role: "user",
            content: trimmed,
            timestamp: Date()
        )
        messages.append(userMessage)
        inputText = ""
        isLoading = true
        error = nil

        Task {
            do {
                // Build ChatMessage array from conversation history
                let chatMessages = messages.compactMap { msg -> ChatMessage? in
                    guard msg.role == "user" || msg.role == "assistant" else { return nil }
                    return ChatMessage(role: msg.role, content: msg.content)
                }

                let response = try await chatService.chat(
                    messages: chatMessages,
                    includeContext: includeContext
                )

                let assistantMessage = DisplayMessage(
                    id: UUID(),
                    role: "assistant",
                    content: response.response,
                    timestamp: Date()
                )
                messages.append(assistantMessage)
            } catch {
                // Remove the user message that failed and restore input
                if let lastIndex = messages.lastIndex(where: { $0.id == userMessage.id }) {
                    messages.remove(at: lastIndex)
                }
                inputText = trimmed
                self.error = error.localizedDescription
            }
            isLoading = false
        }
    }

    func clearConversation() {
        messages.removeAll()
        error = nil
    }

    func dismissError() {
        error = nil
    }
}
