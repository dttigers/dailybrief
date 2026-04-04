import SwiftUI
import JarvisCore

/// Displays a single thought entry in the dashboard list.
struct ThoughtRowView: View {

    let thought: Thought

    /// Whether this row shows full content (expanded).
    var isExpanded: Bool = false

    /// Whether this row is in inline edit mode.
    var isEditing: Bool = false

    /// Whether multi-select mode is active.
    var isSelectionMode: Bool = false

    /// Whether this row is currently selected.
    var isSelected: Bool = false

    /// Called when the user toggles this row's selection.
    var onToggleSelection: (() -> Void)?

    /// Bound to the ViewModel's editedContent for the active editor.
    var editedContent: Binding<String>?

    /// Called when the user clicks the status icon on a task thought. Nil for non-tasks.
    var onStatusToggle: (() -> Void)?

    /// Called when the user clicks the re-triage button. Nil when triage service unavailable.
    var onRetriage: (() -> Void)?

    /// Called when the user deletes this thought from the context menu.
    var onDelete: (() -> Void)?

    /// Called to toggle expand/collapse.
    var onToggleExpand: (() -> Void)?

    /// Called to enter edit mode.
    var onStartEdit: (() -> Void)?

    /// Called to save the current edit.
    var onSaveEdit: (() -> Void)?

    /// Called to cancel the current edit.
    var onCancelEdit: (() -> Void)?

    /// Whether this thought is currently being re-triaged.
    var isRetriaging: Bool = false

    @FocusState private var isEditorFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Content row — optional selection checkbox + status icon + text/editor
            HStack(alignment: .top, spacing: 6) {
                if isSelectionMode {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isSelected ? .blue : .secondary)
                        .font(.body)
                        .onTapGesture { onToggleSelection?() }
                }

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

                if isSelectionMode {
                    // In selection mode, tap toggles selection instead of expand/edit
                    Text(thought.content)
                        .font(.body)
                        .lineLimit(isExpanded ? nil : 2)
                        .truncationMode(.tail)
                        .strikethrough(thought.taskStatus == .done)
                        .foregroundStyle(thought.taskStatus == .done ? .secondary : .primary)
                        .onTapGesture { onToggleSelection?() }
                } else if isEditing, let editedContent {
                    VStack(alignment: .leading, spacing: 4) {
                        TextEditor(text: editedContent)
                            .font(.body)
                            .frame(minHeight: 40, maxHeight: 120)
                            .focused($isEditorFocused)
                            .onAppear { isEditorFocused = true }

                        HStack(spacing: 8) {
                            Button("Save") { onSaveEdit?() }
                                .keyboardShortcut(.return, modifiers: .command)
                            Button("Cancel", role: .cancel) { onCancelEdit?() }
                                .keyboardShortcut(.escape, modifiers: [])
                        }
                        .font(.caption)
                    }
                } else {
                    Text(thought.content)
                        .font(.body)
                        .lineLimit(isExpanded ? nil : 2)
                        .truncationMode(.tail)
                        .strikethrough(thought.taskStatus == .done)
                        .foregroundStyle(thought.taskStatus == .done ? .secondary : .primary)
                        .onTapGesture(count: 2) { onStartEdit?() }
                        .onTapGesture(count: 1) { onToggleExpand?() }
                }
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
            if isSelectionMode {
                Button {
                    onToggleSelection?()
                } label: {
                    Label(isSelected ? "Deselect" : "Select", systemImage: isSelected ? "circle" : "checkmark.circle")
                }
            }
            Button {
                onToggleExpand?()
            } label: {
                Label(isExpanded ? "Collapse" : "Expand", systemImage: isExpanded ? "chevron.up" : "chevron.down")
            }
            Button {
                onStartEdit?()
            } label: {
                Label("Edit", systemImage: "pencil")
            }
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
