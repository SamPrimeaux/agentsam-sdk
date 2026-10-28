import type { Project, Trail } from "@inneranimalmedia/agentsam-local-shared";
import type { WorkArtifact } from "@inneranimalmedia/agentsam-work/contracts";

/** Only actual, loaded local filesystem workspaces are exposed as local files.
 * Scratch templates aren't storage-provider assets, and credentials/content never leave the host.
 */
export function listLocalWorkspaceArtifacts(projects: Project[], trails: Trail[]): WorkArtifact[] {
  return projects.filter(p => p.kind === "filesystem").flatMap(p => {
    const assignments = [...new Set(trails.filter(t => t.projectId === p.id)
      .map(t => t.workProjectId).filter((id): id is string => Boolean(id)))];
    const projectId = assignments.length === 1 ? assignments[0] : null;
    return p.files.slice(0, 300).map(file => ({
      id: "local:" + encodeURIComponent(p.id) + ":" + encodeURIComponent(file.id),
      name: file.path,
      source: "local" as const,
      projectId,
      kind: /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.path) ? "image" as const :
        /\.(zip|tar|gz|7z)$/i.test(file.path) ? "archive" as const :
        /\.(ts|tsx|js|jsx|json|py|rs|scad|css|html|ifc|step|stp|fcstd)$/i.test(file.path) ? "code" as const : "document" as const,
      updatedAt: file.updatedAt,
      updatedLabel: file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : null,
      preview: null, // Private local files require an authorized editor, never a fabricated public URL.
    }));
  });
}

export function localArtifactTarget(artifactId: string, projects: Project[]) {
  if (!artifactId.startsWith("local:")) return null;
  for (const project of projects) {
    if (project.kind !== "filesystem") continue;
    for (const file of project.files) {
      if ("local:" + encodeURIComponent(project.id) + ":" + encodeURIComponent(file.id) === artifactId) {
        return { projectId: project.id, fileId: file.id, path: file.path };
      }
    }
  }
  return null;
}
