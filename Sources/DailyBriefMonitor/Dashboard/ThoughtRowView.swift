import SwiftUI
import JarvisCore

/// Displays a single thought entry in the dashboard list.
struct ThoughtRowView: View {

    let thought: Thought

    /// Called when the user clicks the status icon on a task thought. Nil for non-tasks.
    var onStatusToggle: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Content row — optional status icon + text
            HStack(alignment: .top, spacing: 6) {
                if let status = thought.taskStatus, thought.category == .task {
                    Button {
                        onStatusToggle?()
                    } label: {
                        Image(systemName: status.systemImage)
                            .foregroundStyle(status.displayColor)
                            .font(.body)
                    }
                    .buttonStyle(.plain)
                    .help("Status: \(status.displayName) — click to cycle")
                }

                Text(thought.content)
                    .font(.body)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .strikethrough(thought.taskStatus == .done)
                    .foregroundStyle(thought.taskStatus == .done ? .secondary : .primary)
            }

            // Metadata row: category pill + confidence + timestamp
            HStack(spacing: 8) {
                if let category = thought.category {
                    Text(category.displayName)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(category.displayColor.opacity(0.85))
                        .clipShape(Capsule())
                }

                if let confidence = thought.confidence {
                    Text("\(Int(confidence * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(thought.createdAt, formatter: Self.relativeFormatter)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Formatters

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}
