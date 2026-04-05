import SwiftUI
import UniformTypeIdentifiers
import JarvisCore

/// Central dashboard window — sidebar category filter with thought list and FTS5 search.
struct DashboardView: View {

    @State var viewModel: DashboardViewModel
    @State private var isDropTargeted = false
    // Therapy prep UI removed — classification routing kept, prep/patterns UI disabled
    @State private var bulkTagText = ""
    @State private var showBulkTagPopover = false
    @State private var linkedThoughtsCache: [Int64: [Thought]] = [:]
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detail
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    viewModel.toggleSelectionMode()
                } label: {
                    Label(viewModel.isSelectionMode ? "Done" : "Select",
                          systemImage: viewModel.isSelectionMode ? "checkmark.circle" : "checklist")
                }
                .help(viewModel.isSelectionMode ? "Exit selection mode" : "Enter selection mode")

                Button {
                    viewModel.importFiles()
                } label: {
                    Label("Import Files", systemImage: "square.and.arrow.down.on.square")
                }
                .disabled((!viewModel.canImportAudio && !viewModel.canImportImage) || viewModel.isImporting)
                .help("Import audio and image files")

                Button {
                    viewModel.importAudio()
                } label: {
                    Label("Import Audio", systemImage: "waveform")
                }
                .disabled(!viewModel.canImportAudio || viewModel.isImporting)
                .help("Transcribe audio files")

                Button {
                    viewModel.importImage()
                } label: {
                    Label("Import Image", systemImage: "photo")
                }
                .disabled(!viewModel.canImportImage || viewModel.isImporting)
                .help("Describe and capture images")

            }
        }
        .sheet(isPresented: Binding(
            get: { viewModel.linkingThoughtId != nil },
            set: { if !$0 {
                viewModel.linkingThoughtId = nil
                viewModel.linkSearchQuery = ""
                viewModel.linkSearchResults = []
            }}
        )) {
            LinkedThoughtsSheet(viewModel: viewModel)
        }
        .task {
            await viewModel.refresh()
        }
        .onChange(of: viewModel.selectedFilter) {
            // Reset task status sub-filter, therapy filter, tag filter, favorites, and selection when switching categories
            viewModel.taskStatusFilter = nil
            viewModel.therapyFilter = .all
            viewModel.tagFilter = nil
            viewModel.showFavoritesOnly = false
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.therapyFilter) {
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.taskStatusFilter) {
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.sourceFilter) {
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.dateRangeFilter) {
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.tagFilter) {
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.showFavoritesOnly) {
            viewModel.selectedThoughtIds.removeAll()
            Task { await viewModel.loadThoughts() }
        }
        .onKeyPress(.escape) {
            if viewModel.isSelectionMode {
                viewModel.toggleSelectionMode()
                return .handled
            }
            return .ignored
        }
        .onKeyPress(characters: CharacterSet(charactersIn: "a")) { keyPress in
            if viewModel.isSelectionMode && keyPress.modifiers.contains(.command) {
                viewModel.selectAll()
                return .handled
            }
            return .ignored
        }
    }

    // MARK: - Sidebar

    @ViewBuilder
    private var sidebar: some View {
        List(selection: $viewModel.selectedFilter) {
            // "All" row
            Label {
                HStack {
                    Text("All")
                    Spacer()
                    Text("\(viewModel.totalCount)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(nsColor: .quaternaryLabelColor))
                        .clipShape(Capsule())
                }
            } icon: {
                Image(systemName: "tray.full")
                    .foregroundStyle(.secondary)
            }
            .tag(CategoryFilter.all)

            Section("Categories") {
                ForEach(ThoughtCategory.allCases, id: \.self) { category in
                    Label {
                        HStack {
                            Text(category.displayName)
                            Spacer()
                            Text("\(viewModel.categoryCounts[category] ?? 0)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color(nsColor: .quaternaryLabelColor))
                                .clipShape(Capsule())
                        }
                    } icon: {
                        Image(systemName: "circle.fill")
                            .foregroundStyle(category.displayColor)
                            .font(.caption2)
                    }
                    .tag(CategoryFilter.specific(category))
                }
            }

            // Task status sub-filters — shown when Task category is selected
            if viewModel.selectedFilter == .specific(.task) {
                Section("Status") {
                    taskStatusPills
                }
            }

            // Therapy classification sub-filters — shown when Therapy category is selected
            if viewModel.selectedFilter == .specific(.therapy) {
                Section("Classification") {
                    therapySubFilterPills
                }
            }

            Section("Source") {
                Button {
                    viewModel.sourceFilter = nil
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "tray.full")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("All")
                            .font(.subheadline)
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
                .padding(.vertical, 2)
                .opacity(viewModel.sourceFilter == nil ? 1.0 : 0.6)

                ForEach([CaptureSource.text, .voice, .image], id: \.self) { source in
                    Button {
                        viewModel.sourceFilter = source
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: sourceIcon(for: source))
                                .font(.caption)
                                .foregroundStyle(sourceColor(for: source))
                            Text(sourceDisplayName(for: source))
                                .font(.subheadline)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 2)
                    .opacity(viewModel.sourceFilter == source ? 1.0 : 0.6)
                }
            }

            Section("Date") {
                ForEach(DateRangeFilter.allCases, id: \.self) { range in
                    Button {
                        viewModel.dateRangeFilter = range
                    } label: {
                        HStack {
                            Text(range.displayName)
                                .font(.subheadline)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 2)
                    .opacity(viewModel.dateRangeFilter == range ? 1.0 : 0.6)
                }
            }

            // Favorites filter
            Section {
                Button {
                    viewModel.showFavoritesOnly.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "star.fill")
                            .foregroundStyle(.yellow)
                            .font(.caption)
                        Text("Favorites")
                            .font(.subheadline)
                        Spacer()
                        Text("\(viewModel.favoritesCount)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(nsColor: .quaternaryLabelColor))
                            .clipShape(Capsule())
                    }
                }
                .buttonStyle(.plain)
                .padding(.vertical, 2)
                .opacity(viewModel.showFavoritesOnly ? 1.0 : 0.6)
            }

            // Tags section
            Section("Tags") {
                if viewModel.allTags.isEmpty {
                    Text("No tags yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.allTags, id: \.self) { tag in
                        Button {
                            if viewModel.tagFilter == tag {
                                viewModel.tagFilter = nil
                            } else {
                                viewModel.tagFilter = tag
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "tag")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(tag)
                                    .font(.subheadline)
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 2)
                        .opacity(viewModel.tagFilter == tag ? 1.0 : 0.6)
                    }
                }
            }
        }
        .navigationSplitViewColumnWidth(min: 160, ideal: 200, max: 260)
    }

    /// Status sub-filter pills for task category.
    @ViewBuilder
    private var taskStatusPills: some View {
        // "All" pill
        Button {
            viewModel.taskStatusFilter = nil
        } label: {
            HStack {
                Text("All")
                Spacer()
                Text("\(viewModel.categoryCounts[.task] ?? 0)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .padding(.vertical, 2)
        .opacity(viewModel.taskStatusFilter == nil ? 1.0 : 0.6)

        ForEach([TaskStatus.open, .inProgress, .done], id: \.self) { status in
            Button {
                viewModel.taskStatusFilter = status
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: status.systemImage)
                        .foregroundStyle(status.displayColor)
                        .font(.caption)
                    Text(status.displayName)
                        .font(.subheadline)
                    Spacer()
                    Text("\(viewModel.taskStatusCounts[status] ?? 0)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
            .padding(.vertical, 2)
            .opacity(viewModel.taskStatusFilter == status ? 1.0 : 0.6)
        }
    }

    /// Therapy classification sub-filter pills.
    @ViewBuilder
    private var therapySubFilterPills: some View {
        // "All" pill
        Button {
            viewModel.therapyFilter = .all
        } label: {
            HStack {
                Text("All")
                Spacer()
                Text("\(viewModel.categoryCounts[.therapy] ?? 0)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .padding(.vertical, 2)
        .opacity(viewModel.therapyFilter == .all ? 1.0 : 0.6)

        Button {
            viewModel.therapyFilter = .classified(.selfLearnable)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "book.closed")
                    .foregroundStyle(.green)
                    .font(.caption)
                Text("Self-work")
                    .font(.subheadline)
                Spacer()
                Text("\(viewModel.selfLearnableCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .padding(.vertical, 2)
        .opacity(viewModel.therapyFilter == .classified(.selfLearnable) ? 1.0 : 0.6)

        Button {
            viewModel.therapyFilter = .classified(.bringToTherapist)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "person.fill.questionmark")
                    .foregroundStyle(.orange)
                    .font(.caption)
                Text("Therapist")
                    .font(.subheadline)
                Spacer()
                Text("\(viewModel.bringToTherapistCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .padding(.vertical, 2)
        .opacity(viewModel.therapyFilter == .classified(.bringToTherapist) ? 1.0 : 0.6)

        Button {
            viewModel.therapyFilter = .unclassified
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "questionmark.circle")
                    .foregroundStyle(.secondary)
                    .font(.caption)
                Text("Unclassified")
                    .font(.subheadline)
                Spacer()
                Text("\(viewModel.unclassifiedTherapyCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .padding(.vertical, 2)
        .opacity(viewModel.therapyFilter == .unclassified ? 1.0 : 0.6)

        Text("AI suggestions — not clinical advice")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
    }

    // MARK: - Detail

    @ViewBuilder
    private var detail: some View {
        VStack(spacing: 0) {
            // Batch import progress bar
            if let progress = viewModel.importProgress {
                HStack(spacing: 8) {
                    ProgressView(value: Double(progress.current), total: Double(progress.total))
                        .frame(width: 100)
                    Text("\(progress.phase) \(progress.currentFile) (\(progress.current)/\(progress.total))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color(nsColor: .controlBackgroundColor))
            }

            // Batch import error summary
            if !viewModel.importErrors.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.yellow)
                        Text("\(viewModel.importErrors.count) file(s) failed to import")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Spacer()
                        Button("Dismiss") {
                            viewModel.importErrors.removeAll()
                        }
                        .controlSize(.small)
                    }
                    ForEach(viewModel.importErrors, id: \.self) { error in
                        Text("• \(error)")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(nsColor: .controlBackgroundColor))
            }

            // Active filter chips
            if viewModel.tagFilter != nil || viewModel.showFavoritesOnly {
                HStack(spacing: 8) {
                    if let tagFilter = viewModel.tagFilter {
                        HStack(spacing: 4) {
                            Text("Tag: \(tagFilter)")
                                .font(.caption)
                            Button {
                                viewModel.tagFilter = nil
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 8, weight: .bold))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.2))
                        .clipShape(Capsule())
                    }

                    if viewModel.showFavoritesOnly {
                        HStack(spacing: 4) {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(.yellow)
                            Text("Favorites")
                                .font(.caption)
                            Button {
                                viewModel.showFavoritesOnly = false
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 8, weight: .bold))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.2))
                        .clipShape(Capsule())
                    }

                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }

            // Bulk action bar
            if viewModel.isSelectionMode && !viewModel.selectedThoughtIds.isEmpty {
                HStack(spacing: 12) {
                    if viewModel.isBulkProcessing, let progress = viewModel.bulkProgress {
                        ProgressView()
                            .controlSize(.small)
                        Text("Re-triaging \(progress.current)/\(progress.total)...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("\(viewModel.selectedThoughtIds.count) selected")
                            .font(.subheadline)
                            .fontWeight(.medium)

                        let allSelected = viewModel.selectedThoughtIds.count == viewModel.thoughts.compactMap(\.id).count
                        Button(allSelected ? "Deselect All" : "Select All") {
                            if allSelected {
                                viewModel.deselectAll()
                            } else {
                                viewModel.selectAll()
                            }
                        }
                        .controlSize(.small)

                        Spacer()

                        Button(role: .destructive) {
                            Task { await viewModel.bulkDelete() }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        .controlSize(.small)
                        .disabled(viewModel.isBulkProcessing)

                        Menu {
                            ForEach(ThoughtCategory.allCases, id: \.self) { category in
                                Button(category.displayName) {
                                    Task { await viewModel.bulkRecategorize(category: category) }
                                }
                            }
                        } label: {
                            Label("Re-categorize", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .controlSize(.small)
                        .disabled(viewModel.isBulkProcessing)

                        Button {
                            Task { await viewModel.bulkRetriage() }
                        } label: {
                            Label("Re-triage", systemImage: "sparkles")
                        }
                        .controlSize(.small)
                        .disabled(viewModel.isBulkProcessing)

                        Button {
                            showBulkTagPopover = true
                        } label: {
                            Label("Add Tag", systemImage: "tag")
                        }
                        .controlSize(.small)
                        .disabled(viewModel.isBulkProcessing)
                        .popover(isPresented: $showBulkTagPopover) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Add Tag to Selected")
                                    .font(.headline)
                                HStack {
                                    TextField("Tag name...", text: $bulkTagText)
                                        .textFieldStyle(.roundedBorder)
                                        .onSubmit {
                                            let tag = bulkTagText.trimmingCharacters(in: .whitespacesAndNewlines)
                                            guard !tag.isEmpty else { return }
                                            Task { await viewModel.bulkAddTag(tag: tag) }
                                            bulkTagText = ""
                                            showBulkTagPopover = false
                                        }
                                    Button("Add") {
                                        let tag = bulkTagText.trimmingCharacters(in: .whitespacesAndNewlines)
                                        guard !tag.isEmpty else { return }
                                        Task { await viewModel.bulkAddTag(tag: tag) }
                                        bulkTagText = ""
                                        showBulkTagPopover = false
                                    }
                                    .disabled(bulkTagText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                }
                                if !viewModel.allTags.isEmpty {
                                    Divider()
                                    Text("Existing Tags")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    ScrollView {
                                        LazyVStack(alignment: .leading, spacing: 4) {
                                            ForEach(viewModel.allTags, id: \.self) { tag in
                                                Button {
                                                    Task { await viewModel.bulkAddTag(tag: tag) }
                                                    showBulkTagPopover = false
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
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(nsColor: .controlBackgroundColor))
            }

            // Insights section
            if !viewModel.insights.isEmpty {
                Section("Insights") {
                    ForEach(Array(viewModel.insights.enumerated()), id: \.offset) { _, insight in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: insightIcon(for: insight.type))
                                .foregroundStyle(.purple)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(insight.title)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                Text(insight.message)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            } else if viewModel.isLoadingInsights {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Generating insights...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }

            // Today's Schedule (only when events exist)
            if !viewModel.calendarEvents.isEmpty {
                Section("Today's Schedule") {
                    ForEach(viewModel.calendarEvents) { event in
                        HStack {
                            Text(event.timeString)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 120, alignment: .leading)
                            Text(event.title)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }

            if viewModel.isLoading && viewModel.thoughts.isEmpty {
                Spacer()
                ProgressView("Loading...")
                Spacer()
            } else if viewModel.thoughts.isEmpty {
                Spacer()
                emptyState
                Spacer()
            } else {
                List(viewModel.thoughts) { thought in
                    ThoughtRowView(
                        thought: thought,
                        isExpanded: viewModel.expandedThoughtIds.contains(thought.id ?? -1),
                        isEditing: viewModel.editingThoughtId == thought.id,
                        isSelectionMode: viewModel.isSelectionMode,
                        isSelected: viewModel.selectedThoughtIds.contains(thought.id ?? -1),
                        onToggleSelection: { viewModel.toggleSelection(thought) },
                        editedContent: Binding(
                            get: { viewModel.editedContent },
                            set: { viewModel.editedContent = $0 }
                        ),
                        onStatusToggle: thought.category == .task ? {
                            Task { await viewModel.cycleTaskStatus(for: thought) }
                        } : nil,
                        onRetriage: {
                            Task { await viewModel.reTriageThought(thought) }
                        },
                        onReClassify: thought.category == .therapy ? {
                            Task<Void, Never> { await viewModel.reClassifyTherapy(thought) }
                        } : nil,
                        onToggleFavorite: {
                            guard let id = thought.id else { return }
                            Task { await viewModel.toggleFavorite(thoughtId: id) }
                        },
                        onAddTag: { tag in
                            guard let id = thought.id else { return }
                            Task { await viewModel.addTag(thoughtId: id, tag: tag) }
                        },
                        onRemoveTag: { tag in
                            guard let id = thought.id else { return }
                            Task { await viewModel.removeTag(thoughtId: id, tag: tag) }
                        },
                        allUniqueTags: viewModel.allTags,
                        onLinkThought: {
                            guard let id = thought.id else { return }
                            viewModel.startLinking(thoughtId: id)
                        },
                        linkCount: viewModel.linkCounts[thought.id ?? -1] ?? 0,
                        linkedThoughts: linkedThoughtsCache[thought.id ?? -1] ?? [],
                        onRemoveLink: { linkedId in
                            guard let id = thought.id else { return }
                            Task {
                                await viewModel.removeLink(thoughtId: id, linkedId: linkedId)
                                linkedThoughtsCache.removeValue(forKey: id)
                            }
                        },
                        onDelete: {
                            Task { await viewModel.deleteThought(thought) }
                        },
                        onToggleExpand: {
                            viewModel.toggleExpanded(thought)
                            // Load linked thoughts when expanding (after toggle, check if now expanded)
                            if let id = thought.id, viewModel.expandedThoughtIds.contains(id) {
                                Task {
                                    let linked = await viewModel.fetchLinkedThoughts(thoughtId: id)
                                    linkedThoughtsCache[id] = linked
                                }
                            }
                        },
                        onStartEdit: {
                            viewModel.startEditing(thought)
                        },
                        onSaveEdit: {
                            Task { await viewModel.saveEdit(undoManager: undoManager) }
                        },
                        onCancelEdit: {
                            viewModel.cancelEdit()
                        },
                        isRetriaging: viewModel.retriagingThoughtId == thought.id,
                        isReclassifying: viewModel.reclassifyingThoughtId == thought.id
                    )
                }
            }
        }
        .overlay {
            if isDropTargeted {
                dropOverlay
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers: providers)
        }
        .searchable(text: $viewModel.searchQuery, prompt: "Search thoughts...")
        .frame(minWidth: 400)
    }

    // MARK: - Helpers

    private func insightIcon(for type: InsightType) -> String {
        switch type {
        case .pattern: return "lightbulb"
        case .connection: return "link"
        case .actionPrompt: return "arrow.right.circle"
        case .trend: return "chart.line.uptrend"
        }
    }

    private func sourceIcon(for source: CaptureSource) -> String {
        switch source {
        case .text: return "keyboard"
        case .voice: return "waveform"
        case .image: return "photo"
        }
    }

    private func sourceColor(for source: CaptureSource) -> Color {
        switch source {
        case .text: return .blue
        case .voice: return .orange
        case .image: return .green
        }
    }

    private func sourceDisplayName(for source: CaptureSource) -> String {
        switch source {
        case .text: return "Text"
        case .voice: return "Voice"
        case .image: return "Image"
        }
    }

    private var hasActiveFilters: Bool {
        viewModel.sourceFilter != nil || viewModel.dateRangeFilter != .all ||
        viewModel.tagFilter != nil || viewModel.showFavoritesOnly
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        let hasSearch = !viewModel.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        VStack(spacing: 8) {
            Image(systemName: hasSearch ? "magnifyingglass" : (hasActiveFilters ? "line.3.horizontal.decrease.circle" : "tray"))
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text(hasSearch || hasActiveFilters ? "No results" : "No entries")
                .font(.headline)
                .foregroundStyle(.secondary)

            Text(hasSearch
                 ? "Try a different search term"
                 : hasActiveFilters
                 ? "Try clearing filters"
                 : "Capture a thought with Cmd+Shift+J")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
        }
    }

    // MARK: - Drag & Drop

    @ViewBuilder
    private var dropOverlay: some View {
        RoundedRectangle(cornerRadius: 12)
            .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8, 4]))
            .foregroundStyle(.tint)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.accentColor.opacity(0.08))
            )
            .overlay {
                VStack(spacing: 8) {
                    Image(systemName: "square.and.arrow.down")
                        .font(.largeTitle)
                        .foregroundStyle(.tint)
                    Text("Drop audio or image files here")
                        .font(.headline)
                        .foregroundStyle(.tint)
                }
            }
            .padding(8)
    }

    private nonisolated static let supportedExtensions: Set<String> = [
        "wav", "mp3", "m4a", "aiff",
        "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tiff", "tif", "bmp",
    ]

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        Task {
            var urls: [URL] = []
            for provider in providers {
                guard provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) else { continue }
                if let url = await loadFileURL(from: provider) {
                    let ext = url.pathExtension.lowercased()
                    if Self.supportedExtensions.contains(ext) {
                        urls.append(url)
                    }
                }
            }
            guard !urls.isEmpty else { return }
            await viewModel.processFiles(urls: urls)
        }
        return true
    }

    private func loadFileURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                if let data = item as? Data,
                   let url = URL(dataRepresentation: data, relativeTo: nil) {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}
