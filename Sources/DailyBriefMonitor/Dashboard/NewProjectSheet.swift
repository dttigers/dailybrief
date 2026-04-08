import SwiftUI
import JarvisCore

/// Sheet for creating or editing a project (Phase 53 Plan 04).
///
/// Reuses a single form for both create and edit modes via a `Mode` enum.
/// Copy, placeholders, and validation messages are UI-SPEC verbatim.
struct NewProjectSheet: View {
    enum Mode {
        case create
        case edit(Project)

        var isEdit: Bool {
            if case .edit = self { return true }
            return false
        }

        var title: String {
            switch self {
            case .create: return "New Project"
            case .edit: return "Edit Project"
            }
        }

        var primaryButtonLabel: String {
            switch self {
            case .create: return "Create"
            case .edit: return "Save"
            }
        }
    }

    let mode: Mode
    let viewModel: DashboardViewModel
    var onCreated: ((Project) -> Void)? = nil
    var onSaved: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var descriptionText: String = ""
    @State private var status: ProjectStatus = .active
    @State private var serverError: String? = nil
    @State private var isSubmitting = false
    @State private var didPrefill = false

    private let nameMax = 200
    private let descriptionMax = 2000

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var nameError: String? {
        if trimmedName.isEmpty { return "Name is required" }
        if trimmedName.count > nameMax { return "Name must be 200 characters or fewer" }
        return nil
    }

    private var descriptionError: String? {
        if descriptionText.count > descriptionMax {
            return "Description must be 2000 characters or fewer"
        }
        return nil
    }

    private var canSubmit: Bool {
        nameError == nil && descriptionError == nil && !isSubmitting
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Title
            Text(mode.title)
                .font(.headline)

            // Server error banner (UI-SPEC: inline banner at top of sheet)
            if let err = serverError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text(err)
                        .font(.caption)
                    Spacer()
                }
                .padding(8)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Name field
            VStack(alignment: .leading, spacing: 4) {
                TextField("Project name", text: $name)
                    .textFieldStyle(.roundedBorder)
                if let err = nameError, !name.isEmpty {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            // Description field
            VStack(alignment: .leading, spacing: 4) {
                TextField(
                    "What is this project about? (optional)",
                    text: $descriptionText,
                    axis: .vertical
                )
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...4)
                if let err = descriptionError {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            // Status picker
            VStack(alignment: .leading, spacing: 4) {
                Text("Status")
                    .font(.subheadline)
                Picker("Status", selection: $status) {
                    Text("Active").tag(ProjectStatus.active)
                    Text("Done").tag(ProjectStatus.done)
                    Text("Archived").tag(ProjectStatus.archived)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            Spacer(minLength: 0)

            // Buttons
            HStack {
                Spacer()
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Button(mode.primaryButtonLabel) {
                    submit()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(!canSubmit)
            }
        }
        .padding(16)
        .frame(width: 420)
        .onAppear {
            // Pre-fill on edit mode. onAppear (not .task) so state is set
            // before the first render — avoids a flash of empty fields.
            guard !didPrefill else { return }
            didPrefill = true
            if case .edit(let project) = mode {
                name = project.name
                descriptionText = project.description ?? ""
                status = project.status ?? .active
            }
        }
    }

    private func submit() {
        guard canSubmit else { return }
        isSubmitting = true
        serverError = nil

        let submittedName = trimmedName
        let submittedDescription: String? =
            descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil : descriptionText
        let submittedStatus = status
        let submittedMode = mode

        Task { @MainActor in
            do {
                switch submittedMode {
                case .create:
                    let created = try await viewModel.createProject(
                        name: submittedName,
                        description: submittedDescription,
                        status: submittedStatus
                    )
                    onCreated?(created)
                    dismiss()
                case .edit(let project):
                    try await viewModel.updateProject(
                        id: project.id,
                        name: submittedName,
                        description: submittedDescription,
                        status: submittedStatus
                    )
                    onSaved?()
                    dismiss()
                }
            } catch {
                // UI-SPEC: show server error in the top banner
                if case .create = submittedMode {
                    serverError = "Couldn't create project. \(error.localizedDescription)"
                } else {
                    serverError = "Couldn't update project. Your change wasn't saved."
                }
                isSubmitting = false
            }
        }
    }
}
