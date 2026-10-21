import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';

export const DREAMHOUSE_DESIGN_URL = 'https://cad.inneranimalmedia.com/api/cad/public-world/dreamhouse/v1.1/design.json';

/** Loads the published editable BIM, never a substitute demo scene. */
export async function loadDreamHouseProject(fetcher: typeof fetch = fetch): Promise<ProjectState> {
  let response: Response;
  try {
    // The CAD service is a separate origin. Carry the current account session
    // if the host and its CORS policy support authenticated CAD access.
    response = await fetcher(DREAMHOUSE_DESIGN_URL, {credentials:'include'});
  } catch {
    throw new Error('Cannot reach the authenticated CAD service. Check your connection and sign in to AgentSam.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('Access to the DreamHouse BIM requires an authorized AgentSam CAD session.');
  }
  if (!response.ok) throw new Error('DreamHouse BIM service failed (HTTP '+response.status+').');
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('DreamHouse BIM service did not return a valid project document.'); }
  if (!data || typeof data !== 'object' || !('id' in data)
    || data.id !== 'dreamhouse-v1-wip'
    || !('walls' in data) || !Array.isArray(data.walls)
    || !('rooms' in data) || !Array.isArray(data.rooms)) {
    throw new Error('DreamHouse BIM project contract failed; the current canvas was preserved.');
  }
  return data as ProjectState;
}
