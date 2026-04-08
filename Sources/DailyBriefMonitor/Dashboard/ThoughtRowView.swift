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

    /// Called when the user requests re-classification of a therapy thought.
    var onReClassify: (() -> Void)?

    /// Called when the user toggles the favorite status of this thought.
    var onToggleFavorite: (() -> Void)?

    /// Called when the user adds a tag to this thought.
    var onAddTag: ((String) -> Void)?

    /// Called when the user removes a tag from this thought.
    var onRemoveTag: ((String) -> Void)?

    /// All unique tags across all thoughts, for the tag picker.
    var allUniqueTags: [String] = []

    /// Called when the user wants to link this thought to another.
    var onLinkThought: (() -> Void)?

    /// Number of linked thoughts for this thought.
    var linkCount: Int = 0

    /// Linked thoughts to display in expanded view.
    var linkedThoughts: [Thought] = []

    /// Called when the user removes a link from expanded view.
    var onRemoveLink: ((Int64) -> Void)?

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

    /// Whether this thought is currently being re-classified.
    var isReclassifying: Bool = false

    // MARK: - Phase 53 Plan 04 — Project assignment

    /// Projects available in the row menu's `Project` submenu. Ordered/filtered
    /// by the caller (`DashboardViewModel.filteredProjects`).
    var availableProjects: [Project] = []

    /// Called when the user picks a project from the row menu.
    var onAssignProject: ((Int64) -> Void)?

    /// Called when the user picks `Unassign` (only shown when thought.projectId != nil).
    var onUnassignProject: (() -> Void)?

    /// Called when the user picks `+ New Project…` — opens the create sheet
    /// and the caller handles the create-and-assign flow.
    var onCreateAndAssignProject: (() -> Void)?

    @FocusState private var isEditorFocused: Bool
    @State private var showTagPopover = false
    @State private var newTagText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Content row — favorite star + optional selection checkbox + status icon + text/editor
            HStack(alignment: .top, spacing: 6) {
                // Favorite star toggle
                Button {
                    onToggleFavorite?()
                } label: {
                    Image(systemName: thought.isFavorited ? "star.fill" : "star")
                        .foregroundStyle(thought.isFavorited ? .yellow : .secondary.opacity(0.4))
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .help(thought.isFavorited ? "Remove from favorites" : "Add to favorites")
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

                    // Therapy classification badge
                    if thought.category == .therapy {
                        if isReclassifying {
                            ProgressView()
                                .controlSize(.mini)
                        } else if let classification = thought.therapyClassification {
                            HStack(spacing: 3) {
                                Image(systemName: classification == .selfLearnable ? "book.closed" : "person.fill.questionmark")
                                    .font(.caption2)
                                Text(classification == .selfLearnable ? "Self-work" : "Therapist")
                                    .font(.caption2.weight(.medium))
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                (classification == .selfLearnable ? Color.green : Color.orange).opacity(0.85)
                            )
                            .clipShape(Capsule())
                        }
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

                    // Link count badge
                    if linkCount > 0 {
                        HStack(spacing: 2) {
                            Image(systemName: "link")
                                .font(.caption2)
                            Text("\(linkCount)")
                                .font(.caption2)
                        }
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(Capsule())
                    }
                }

                Spacer()

                Text(thought.createdAt, formatter: Self.relativeFormatter)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Tag pills row — shown when thought has tags
            if let tags = thought.tags, !tags.isEmpty {
                HStack(spacing: 4) {
                    ForEach(tags, id: \.self) { tag in
                        HStack(spacing: 3) {
                            Text(tag)
                                .font(.caption2)
                            Button {
                                onRemoveTag?(tag)
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 8, weight: .bold))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.2))
                        .clipShape(Capsule())
                    }

                    Button {
                        showTagPopover = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.caption2)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.15))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showTagPopover) {
                        tagPickerPopover
                    }
                }
            } else {
                // No tags — show subtle add button on hover area
                Button {
                    showTagPopover = true
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "tag")
                            .font(.caption2)
                        Text("Add tag")
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary.opacity(0.5))
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showTagPopover) {
                    tagPickerPopover
                }
            }

            // Linked thoughts section — shown when expanded and has links
            if isExpanded && !linkedThoughts.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Linked Thoughts")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)

                    ForEach(linkedThoughts) { linked in
                        HStack(spacing: 6) {
                            Text(linked.content)
                                .font(.caption)
                                .lineLimit(1)
                                .truncationMode(.tail)

                            if let category = linked.category {
                                Text(category.displayName)
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(category.displayColor.opacity(0.85))
                                    .clipShape(Capsule())
                            }

                            Spacer()

                            if let linkedId = linked.id {
                                Button {
                                    onRemoveLink?(linkedId)
                                } label: {
                                    Image(systemName: "link.badge.minus")
                                        .font(.caption2)
                                        .foregroundStyle(.red.opacity(0.7))
                                }
                                .buttonStyle(.plain)
                                .help("Unlink this thought")
                            }
                        }
                        .padding(.vertical, 2)
                        .padding(.horizontal, 4)
                        .background(Color.secondary.opacity(0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
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
            if thought.category == .therapy, let onReClassify {
                Button {
                    onReClassify()
                } label: {
                    Label("Re-classify therapy", systemImage: "arrow.triangle.2.circlepath")
                }
            }
            // Phase 53 Plan 04 — nested Project submenu (RESEARCH Pattern 6).
            if !availableProjects.isEmpty || onCreateAndAssignProject != nil {
                Menu {
                    // "Currently: …" disabled header (UI-SPEC)
                    if let assignedId = thought.projectId,
                       let current = availableProjects.first(where: { $0.id == assignedId }) {
                        Section {
                            Text("Currently: \(current.name)")
                                .font(.caption)
                        }
                    }

                    ForEach(availableProjects) { project in
                        Button(project.name) {
                            onAssignProject?(project.id)
                        }
                    }

                    if thought.projectId != nil {
                        Divider()
                        Button {
                            onUnassignProject?()
                        } label: {
                            Label("Unassign", systemImage: "xmark.circle")
                        }
                    }

                    Divider()
                    Button {
                        onCreateAndAssignProject?()
                    } label: {
                        Label("+ New Project…", systemImage: "plus")
                    }
                } label: {
                    Label("Project", systemImage: "folder")
                }
            }
            Button {
                onLinkThought?()
            } label: {
                Label("Link to...", systemImage: "link")
            }
            Divider()
            Button(role: .destructive) {
                onDelete?()
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Tag Picker

    @ViewBuilder
    private var tagPickerPopover: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Add Tag")
                .font(.headline)

            HStack {
                TextField("New tag...", text: $newTagText)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit {
                        if !newTagText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            onAddTag?(newTagText.trimmingCharacters(in: .whitespacesAndNewlines))
                            newTagText = ""
                            showTagPopover = false
                        }
                    }
                Button("Add") {
                    if !newTagText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        onAddTag?(newTagText.trimmingCharacters(in: .whitespacesAndNewlines))
                        newTagText = ""
                        showTagPopover = false
                    }
                }
                .disabled(newTagText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            let currentTags = thought.tags ?? []
            let available = allUniqueTags.filter { !currentTags.contains($0) }
            if !available.isEmpty {
                Divider()
                Text("Existing Tags")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(available, id: \.self) { tag in
                            Button {
                                onAddTag?(tag)
                                showTagPopover = false
                            } label: {
                                Text(tag)
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 120)
            }
        }
        .padding()
        .frame(width: 220)
    }

    // MARK: - Formatters

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}
