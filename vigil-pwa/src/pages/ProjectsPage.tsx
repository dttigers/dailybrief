import ProjectCard from '../components/ProjectCard'
import { useProjects } from '../hooks/useProjects'

export default function ProjectsPage() {
  const { projects, projectThoughts, unassignedThoughts, isLoading, error, assignThought, unassignThought } =
    useProjects()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-400 text-sm">
        Failed to load projects: {error}
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 text-sm">
        No projects yet. Create projects from the Mac dashboard or API.
      </div>
    )
  }

  const activeCount = projects.filter((p) => p.status === 'active').length
  const archivedCount = projects.filter((p) => p.status === 'archived').length

  return (
    <div className="flex flex-col min-h-[calc(100vh-10rem)]">
      <div className="mb-3 text-sm text-gray-400">
        {projects.length} project{projects.length !== 1 ? 's' : ''}{' '}
        <span className="text-gray-400">
          ({activeCount} active, {archivedCount} archived)
        </span>
      </div>
      <div className="space-y-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            thoughts={projectThoughts[project.id] ?? []}
            unassignedThoughts={unassignedThoughts}
            onAssign={assignThought}
            onUnassign={unassignThought}
          />
        ))}
      </div>
    </div>
  )
}
