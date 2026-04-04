import SwiftUI
import UniformTypeIdentifiers
import JarvisCore

/// Central dashboard window — sidebar category filter with thought list and FTS5 search.
struct DashboardView: View {

    @State var viewModel: DashboardViewModel
    @State private var isDropTargeted = false

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detail
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
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
        .task {
            await viewModel.refresh()
        }
        .onChange(of: viewModel.selectedFilter) {
            // Reset task status sub-filter when switching categories
            viewModel.taskStatusFilter = nil
            Task { await viewModel.loadThoughts() }
        }
        .onChange(of: viewModel.taskStatusFilter) {
            Task { await viewModel.loadThoughts() }
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
                        onStatusToggle: thought.category == .task ? {
                            Task { await viewModel.cycleTaskStatus(for: thought) }
                        } : nil,
                        onRetriage: {
                            Task { await viewModel.reTriageThought(thought) }
                        },
                        onDelete: {
                            Task { await viewModel.deleteThought(thought) }
                        },
                        isRetriaging: viewModel.retriagingThoughtId == thought.id
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

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        let hasSearch = !viewModel.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        VStack(spacing: 8) {
            Image(systemName: hasSearch ? "magnifyingglass" : "tray")
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text(hasSearch ? "No results" : "No entries")
                .font(.headline)
                .foregroundStyle(.secondary)

            Text(hasSearch
                 ? "Try a different search term"
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
