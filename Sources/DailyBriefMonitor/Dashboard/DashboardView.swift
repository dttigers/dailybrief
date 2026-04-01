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
