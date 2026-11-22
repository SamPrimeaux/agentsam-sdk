import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {createDreamHouseTerrainDocument} from './world-terrain';

export const DREAMHOUSE_PROJECT_ID = 'dreamhouse-v1-wip';
export const DREAMHOUSE_DESIGN_URL = 'https://cad.inneranimalmedia.com/api/cad/public-world/dreamhouse/v1.1/design.json';

/** Attach the historical site only to its owning project; never to generic CAD documents. */
export function withDreamHouseTerrain(project:ProjectState):ProjectState {
  if(project.id!==DREAMHOUSE_PROJECT_ID||project.sceneSettings?.terrain!=null)return project;
  return {...project,sceneSettings:{...project.sceneSettings,terrain:createDreamHouseTerrainDocument()}};
}

/** Loads only the explicitly published public DreamHouse example projection. This is not the owner BIM. */
export async function loadDreamHouseProject(fetcher: typeof fetch = fetch): Promise<ProjectState> {
  let response: Response;
  try {
    // This is an explicitly published, read-only D1/R2 projection. Do not send
    // account cookies across origins; private editing uses a separate API.
    response = await fetcher(DREAMHOUSE_DESIGN_URL, {credentials:'omit'});
  } catch {
    throw new Error('Cannot reach the public DreamHouse example. The current canvas was preserved.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('The public DreamHouse example is unavailable (HTTP '+response.status+'). The current canvas was preserved.');
  }
  if (!response.ok) throw new Error('Public DreamHouse example service failed (HTTP '+response.status+'). The current canvas was preserved.');
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('The public DreamHouse example did not return a valid project document.'); }
  if (!data || typeof data !== 'object' || !('id' in data)
    || data.id !== DREAMHOUSE_PROJECT_ID
    || !('walls' in data) || !Array.isArray(data.walls)
    || !('rooms' in data) || !Array.isArray(data.rooms)) {
    throw new Error('Public DreamHouse example contract failed; the current canvas was preserved.');
  }
  return withDreamHouseTerrain(data as ProjectState);
}
