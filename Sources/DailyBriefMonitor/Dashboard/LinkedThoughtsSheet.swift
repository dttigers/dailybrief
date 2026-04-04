import SwiftUI
import JarvisCore

/// Sheet for searching and selecting a thought to link to the current linking source.
struct LinkedThoughtsSheet: View {

    @Bindable var viewModel: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Link to Thought")
                    .font(.headline)
                Spacer()
                Button("Cancel") {
                    viewModel.linkingThoughtId = nil
                    viewModel.linkSearchQuery = ""
                    viewModel.linkSearchResults = []
                    dismiss()
                }
                .keyboardShortcut(.escape, modifiers: [])
            }

            TextField("Search thoughts...", text: Binding(
                get: { viewModel.linkSearchQuery },
                set: { newValue in
                    Task { await viewModel.searchForLinkTarget(query: newValue) }
                }
            ))
            .textFieldStyle(.roundedBorder)

            if viewModel.linkSearchResults.isEmpty {
                if viewModel.linkSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("Type to search for a thought to link")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    Text("No matching thoughts")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                }
            } else {
                List(viewModel.linkSearchResults) { thought in
                    Button {
                        guard let targetId = thought.id else { return }
                        Task {
                            await viewModel.createLink(targetId: targetId)
                            dismiss()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(thought.content)
                                .font(.subheadline)
                                .lineLimit(2)
                                .truncationMode(.tail)

                            Spacer()

                            if let category = thought.category {
                                Text(category.displayName)
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(category.displayColor.opacity(0.85))
                                    .clipShape(Capsule())
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding()
        .frame(minWidth: 400, minHeight: 300)
    }
}
