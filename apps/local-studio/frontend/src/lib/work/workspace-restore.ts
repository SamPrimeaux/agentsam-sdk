import type { Project } from "@inneranimalmedia/agentsam-local-shared";

/** Stable id historically used for the auto-booted Studio scratch seed. */
export const LEGACY_STARTER_PROJECT_ID = "project-studio";

/**
 * Sample / tutorial workspaces are opt-in only. They must never be treated as an
 * authorized host project, and they must never be silently promoted to canonical.
 */
export function isSampleProject(project: Project | null | undefined): boolean {
  if (!project) return false;
  if (project.kind === "filesystem") return false;
  const description = (project.description || "").toLowerCase();
  if (description.includes("sample") || description.includes("tutorial") || description.includes("scratch")) {
    return true;
  }
  if (project.id === LEGACY_STARTER_PROJECT_ID) return true;
  const seeded = (project.files || []).filter((file) => file.origin === "seed");
  return seeded.length > 0 && seeded.length === (project.files || []).length && (project.files || []).length > 0;
}

export function isAuthorizedHostProject(project: Project | null | undefined): boolean {
  return Boolean(
    project &&
      project.kind === "filesystem" &&
      project.workspaceRoot &&
      project.runtimeBaseUrl,
  );
}

/**
 * Prefer the previously active project when it still exists.
 * Otherwise prefer an authorized host workspace over any sample/scratch lane.
 * Never invent a starter project id.
 */
export function pickRestoredProjectId(
  projects: Project[],
  preferredId: string | null | undefined,
): string {
  if (!projects.length) return "";
  if (preferredId && projects.some((project) => project.id === preferredId)) {
    return preferredId;
  }
  const host = projects.find((project) => isAuthorizedHostProject(project));
  if (host) return host.id;
  const nonSample = projects.find((project) => !isSampleProject(project));
  if (nonSample) return nonSample.id;
  return projects[0]!.id;
}

export function projectNeedsConnection(project: Project | null | undefined): boolean {
  if (!project) return true;
  if (isAuthorizedHostProject(project)) return false;
  // Empty browser workspace still needs an explicit host or sample choice.
  if ((project.kind === "scratch" || !project.kind) && !(project.files || []).length) return true;
  return false;
}
