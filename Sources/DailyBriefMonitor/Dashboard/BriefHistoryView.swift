import SwiftUI
import JarvisCore

/// Displays a browsable list of past daily briefs grouped by month.
struct BriefHistoryView: View {

    @State var viewModel: BriefHistoryViewModel

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.briefs.isEmpty {
                VStack(spacing: 8) {
                    ProgressView("Loading brief history...")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.briefs.isEmpty {
                emptyState
            } else {
                briefList
            }
        }
        .sheet(item: $viewModel.selectedBrief) { brief in
            briefDetail(brief)
        }
        .task {
            await viewModel.loadHistory()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await viewModel.loadHistory() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
            }
        }
    }

    // MARK: - Brief List

    @ViewBuilder
    private var briefList: some View {
        List {
            ForEach(viewModel.groupedBriefs, id: \.key) { group in
                Section(group.key) {
                    ForEach(group.briefs) { brief in
                        Button {
                            viewModel.selectedBrief = brief
                        } label: {
                            briefRow(brief)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Brief Row

    @ViewBuilder
    private func briefRow(_ brief: BriefRecord) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(brief.displayDate)
                    .font(.subheadline)
                    .fontWeight(.medium)

                HStack(spacing: 12) {
                    Label("\(brief.thoughtCount) thoughts", systemImage: "bubble.left")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Label("\(brief.taskCount) tasks", systemImage: "checklist")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if brief.pdfFilename != nil {
                Image(systemName: "doc.fill")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            }

            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
                .font(.caption)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 4)
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text("No brief history yet")
                .font(.headline)
                .foregroundStyle(.secondary)

            Text("Generate your first brief with `dailybrief generate`.")
                .font(.subheadline)
                .foregroundStyle(.tertiary)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Brief Detail

    @ViewBuilder
    private func briefDetail(_ brief: BriefRecord) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text(brief.displayDate)
                    .font(.title2)
                    .fontWeight(.bold)
                Spacer()
                Button("Done") {
                    viewModel.selectedBrief = nil
                }
                .keyboardShortcut(.cancelAction)
            }

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Stats
                    HStack(spacing: 24) {
                        statBadge(
                            label: "Thoughts",
                            value: "\(brief.thoughtCount)",
                            icon: "bubble.left",
                            color: .blue
                        )
                        statBadge(
                            label: "Tasks",
                            value: "\(brief.taskCount)",
                            icon: "checklist",
                            color: .orange
                        )
                    }

                    // Category breakdown
                    if let counts = brief.summary?.categoryCounts, !counts.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Category Breakdown")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            ForEach(counts.sorted(by: { $0.key < $1.key }), id: \.key) { key, value in
                                HStack {
                                    Text(key.capitalized)
                                        .font(.caption)
                                    Spacer()
                                    Text("\(value)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    // Top tasks
                    if let tasks = brief.summary?.topTasks, !tasks.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Top Tasks")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            ForEach(tasks, id: \.self) { task in
                                HStack(alignment: .top, spacing: 6) {
                                    Image(systemName: "circle")
                                        .font(.system(size: 6))
                                        .foregroundStyle(.secondary)
                                        .padding(.top, 5)
                                    Text(task)
                                        .font(.caption)
                                }
                            }
                        }
                    }

                    // Affirmation
                    if let affirmation = brief.summary?.affirmation, !affirmation.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Affirmation")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            Text(affirmation)
                                .font(.caption)
                                .italic()
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Sports summary
                    if let sports = brief.summary?.sportsSummary, !sports.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Sports")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            Text(sports)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Divider()

                    // Actions
                    HStack(spacing: 12) {
                        Button {
                            viewModel.openPDF(for: brief)
                        } label: {
                            Label("Open PDF", systemImage: "doc.richtext")
                        }
                        .disabled(brief.pdfFilename == nil)

                        Button {
                            viewModel.reprintPDF(for: brief)
                        } label: {
                            Label("Reprint", systemImage: "printer")
                        }
                        .disabled(brief.pdfFilename == nil)
                    }

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .padding(20)
        .frame(minWidth: 400, minHeight: 350)
    }

    // MARK: - Helpers

    @ViewBuilder
    private func statBadge(label: String, value: String, icon: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.title3)
                    .fontWeight(.bold)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
