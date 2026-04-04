import SwiftUI
import JarvisCore

/// View displaying therapy patterns and session prep with generate/copy functionality.
struct TherapyPrepView: View {

    @State var viewModel: DashboardViewModel
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                content
            }
            .padding()
        }
        .frame(minWidth: 400, minHeight: 300)
    }

    // MARK: - Header

    @ViewBuilder
    private var header: some View {
        HStack {
            Text("Therapy Prep")
                .font(.title2)
                .fontWeight(.bold)
            Spacer()
            Button {
                Task { await viewModel.generateTherapyPrep() }
            } label: {
                Label(
                    viewModel.therapyPrep != nil ? "Regenerate" : "Generate",
                    systemImage: "sparkles"
                )
            }
            .disabled(viewModel.isLoadingTherapyPrep)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoadingTherapyPrep {
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text("Analyzing therapy thoughts...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 20)
        } else if !viewModel.therapyPatterns.isEmpty || viewModel.therapyPrep != nil {
            patternsSection
            prepSection
            copyButton
        } else {
            Text("Tap Generate to create therapy session prep from your recent thoughts")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 20)
        }

        Text("AI suggestions — not clinical advice")
            .font(.caption2)
            .foregroundStyle(.secondary)
    }

    // MARK: - Patterns Section

    @ViewBuilder
    private var patternsSection: some View {
        if !viewModel.therapyPatterns.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Patterns (last 30 days)")
                    .font(.headline)

                ForEach(Array(viewModel.therapyPatterns.enumerated()), id: \.offset) { _, pattern in
                    HStack(spacing: 8) {
                        Text(pattern.theme)
                            .font(.subheadline)
                            .fontWeight(.medium)

                        trendBadge(pattern.trend)

                        Spacer()

                        Text("\(pattern.frequency)x")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(nsColor: .quaternaryLabelColor))
                            .clipShape(Capsule())
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    // MARK: - Prep Section

    @ViewBuilder
    private var prepSection: some View {
        if let prep = viewModel.therapyPrep {
            VStack(alignment: .leading, spacing: 12) {
                Text("Session Prep")
                    .font(.headline)

                if !prep.suggestedFocus.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Suggested Focus:")
                            .font(.subheadline)
                            .fontWeight(.bold)
                        Text(prep.suggestedFocus)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if !prep.items.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Topics:")
                            .font(.subheadline)
                            .fontWeight(.bold)

                        ForEach(Array(prep.items.enumerated()), id: \.offset) { _, item in
                            HStack(alignment: .top, spacing: 8) {
                                urgencyIndicator(item.urgency)
                                    .padding(.top, 3)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.topic)
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                    Text(item.context)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Copy Button

    @ViewBuilder
    private var copyButton: some View {
        if viewModel.therapyPrep != nil {
            HStack {
                Spacer()
                Button {
                    let text = viewModel.therapyPrepAsText()
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(text, forType: .string)
                    copied = true
                    Task {
                        try? await Task.sleep(for: .seconds(2))
                        copied = false
                    }
                } label: {
                    Label(copied ? "Copied!" : "Copy to Clipboard", systemImage: copied ? "checkmark" : "doc.on.doc")
                }
                Spacer()
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func trendBadge(_ trend: String) -> some View {
        let color: Color = switch trend.lowercased() {
        case "increasing": .orange
        case "decreasing": .green
        default: .blue
        }

        Text(trend.capitalized)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    @ViewBuilder
    private func urgencyIndicator(_ urgency: String) -> some View {
        let color: Color = switch urgency.lowercased() {
        case "high": .red
        case "medium": .orange
        default: .gray
        }

        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
    }
}
