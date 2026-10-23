import { describe, expect, it, vi } from 'vitest';
import { loadOwnerDreamHouseProject, OWNER_DREAMHOUSE_PROJECT_ID } from './owner-project-source';

const endpoint = '/api/cad/project/tools/design_project_get';
const project = { id: OWNER_DREAMHOUSE_PROJECT_ID, name: 'DreamHouse V1', walls: [{ id: 'wall-1' }], rooms: [{ id: 'room-1' }] };

describe('owner DreamHouse source', () => {
  it('loads the owner project only through the local project runtime', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { project, revision: 3 } }) });
    await expect(loadOwnerDreamHouseProject(fetcher as unknown as typeof fetch)).resolves.toEqual(project);
    expect(fetcher).toHaveBeenCalledWith(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: OWNER_DREAMHOUSE_PROJECT_ID }),
    });
  });

  it('never falls back to the public example when the local owner runtime is unavailable', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(loadOwnerDreamHouseProject(fetcher as unknown as typeof fetch)).rejects.toThrow('owner BIM was not replaced');
  });

  it('rejects a different project identity', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { project: { ...project, id: 'tpl_modern_villa' } } }) });
    await expect(loadOwnerDreamHouseProject(fetcher as unknown as typeof fetch)).rejects.toThrow('owner-project contract');
  });

  it('preserves the current canvas on network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(loadOwnerDreamHouseProject(fetcher as unknown as typeof fetch)).rejects.toThrow('local CAD project service is unavailable');
  });
});
