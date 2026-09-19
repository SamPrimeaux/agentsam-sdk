export function createProjectsAdapter(config = {}) {
  return {
    type: 'business.projects',
    config,
    toWorkItems(projects = []) {
      return projects.map((project) => {
        if (!project.id) throw new TypeError('project requires id');
        return {
          id: String(project.id),
          title: String(project.name ?? project.title ?? 'Project'),
          type: 'project',
          status: project.status ?? 'planned',
          owner: project.owner ?? project.client_id ?? null,
          start: project.start ?? null,
          end: project.end ?? project.due_at ?? null,
          dependencies: project.dependencies ?? [],
          artifacts: project.artifacts ?? [],
          evidence: project.evidence ?? [],
        };
      });
    },
  };
}
