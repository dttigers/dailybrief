import SwiftUI
import JarvisCore

/// Displays a single thought entry in the dashboard list.
struct ThoughtRowView: View {

    let thought: Thought

    /// Called when the user clicks the status icon on a task thought. Nil for non-tasks.
    var onStatusToggle: (() -> Void)?

    /// Called when the user clicks the re-triage button. Nil when triage service unavailable.
    var onRetriage: (() -> Void)?

    /// Called when the user deletes this thought from the context menu.
    var onDelete: (() -> Void)?

    /// Whether this thought is currently being re-triaged.
    var isRetriaging: Bool = false

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

            // Metadata row: category pill + confidence + re-triage + timestamp
            HStack(spacing: 8) {
                if isRetriaging {
                    ProgressView()
                        .controlSize(.small)
                    Text("Categorizing...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
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

                    if onRetriage != nil {
                        Button {
                            onRetriage?()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .help("Re-categorize this thought")
                    }
                }

                Spacer()

                Text(thought.createdAt, formatter: Self.relativeFormatter)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .contextMenu {
            if let onStatusToggle {
                Button {
                    onStatusToggle()
                } label: {
                    Label("Cycle Status", systemImage: "arrow.triangle.2.circlepath")
                }
            }
            if onRetriage != nil {
                Button {
                    onRetriage?()
                } label: {
                    Label("Re-categorize", systemImage: "arrow.clockwise")
                }
            }
            Divider()
            Button(role: .destructive) {
                onDelete?()
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Formatters

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}
