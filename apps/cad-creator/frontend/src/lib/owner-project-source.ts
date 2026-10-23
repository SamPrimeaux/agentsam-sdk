import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';

export const OWNER_DREAMHOUSE_PROJECT_ID = 'dreamhouse-v1-wip';
const OWNER_PROJECT_ENDPOINT = '/api/cad/project/tools/design_project_get';

/** Load the owner BIM only from the loopback CAD project runtime. No public fallback. */
export async function loadOwnerDreamHouseProject(fetcher: typeof fetch = fetch): Promise<ProjectState> {
  let response: Response;
  try {
    response = await fetcher(OWNER_PROJECT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: OWNER_DREAMHOUSE_PROJECT_ID }),
    });
  } catch {
    throw new Error('The local CAD project service is unavailable. The owner BIM was not replaced.');
  }

  if (!response.ok) {
    throw new Error(`The local CAD project service could not load DreamHouse (HTTP ${response.status}). The owner BIM was not replaced.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The local CAD project service returned an invalid response. The owner BIM was not replaced.');
  }

  const result = payload && typeof payload === 'object' && 'result' in payload
    ? (payload as { result?: unknown }).result
    : undefined;
  const project = result && typeof result === 'object' && 'project' in result
    ? (result as { project?: unknown }).project
    : undefined;

  if (!project || typeof project !== 'object'
    || !('id' in project) || project.id !== OWNER_DREAMHOUSE_PROJECT_ID
    || !('walls' in project) || !Array.isArray(project.walls)
    || !('rooms' in project) || !Array.isArray(project.rooms)) {
    throw new Error('The local CAD project response did not match the DreamHouse owner-project contract. The owner BIM was not replaced.');
  }

  return project as ProjectState;
}
