import SwiftUI
import JarvisCore

/// Central dashboard window — sidebar category filter with thought list and FTS5 search.
struct DashboardView: View {

    @State var viewModel: DashboardViewModel

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detail
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    viewModel.importAudio()
                } label: {
                    Label("Import Audio", systemImage: "waveform")
                }
                .disabled(!viewModel.canImportAudio || viewModel.isImporting)
                .help("Transcribe an audio file")

                Button {
                    viewModel.importImage()
                } label: {
                    Label("Import Image", systemImage: "photo")
                }
                .disabled(!viewModel.canImportImage || viewModel.isImporting)
                .help("Describe and capture an image")
            }
        }
        .task {
            await viewModel.refresh()
        }
        .onChange(of: viewModel.selectedFilter) {
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
        }
        .navigationSplitViewColumnWidth(min: 160, ideal: 200, max: 260)
    }

    // MARK: - Detail

    @ViewBuilder
    private var detail: some View {
        VStack(spacing: 0) {
            // Import status bar
            if let status = viewModel.importStatus {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(status)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color(nsColor: .controlBackgroundColor))
            }

            if let error = viewModel.importError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                    Spacer()
                    Button("Dismiss") {
                        viewModel.importError = nil
                    }
                    .controlSize(.small)
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
                    ThoughtRowView(thought: thought)
                }
            }
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
}
