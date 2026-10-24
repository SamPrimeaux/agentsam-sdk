import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';

export interface CadAsset { id: string; name: string; status: string; validationStatus: string; contentHash: string | null }
export interface CadRevision { revision: string; status: string; updatedAt: number; models: CadAsset[]; documents: CadAsset[]; native: CadAsset[] }
export interface CadRegistry { project: { id: string; name: string }; revisions: CadRevision[] }
export interface CadHostedSelection { project: ProjectState; registry: CadRegistry; revision: CadRevision; modelUrl: string }

export const cadRegistryUrl = (id: string) => `/api/work/projects/${encodeURIComponent(id)}/cad`;
export const cadAssetUrl = (id: string, assetId: string) => `${cadRegistryUrl(id)}/assets/${encodeURIComponent(assetId)}`;

async function readJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to open this CAD project.' : `Project registry could not load ${url} (HTTP ${res.status}).`);
  return res.json() as Promise<T>;
}

/** Authoritative project list; a CAD fixture must never masquerade as a stored project. */
export async function listHostedProjects(fetcher: typeof fetch = fetch): Promise<Array<{ id: string; name: string }>> {
  const result = await readJson<{ snapshot?: { projects?: Array<{ id: string; name: string }> } }>('/api/work/snapshot?surface=projects', fetcher);
  return (result.snapshot?.projects || []).filter((item) => typeof item.id === 'string' && typeof item.name === 'string');
}

/**
 * Select only an explicitly registered geometry + editable design representation.
 * R2 drafts remain drafts; opening one never publishes or changes its source.
 */
export async function loadHostedProject(projectId: string, requestedRevision?: string, fetcher: typeof fetch = fetch): Promise<CadHostedSelection> {
  const registry = await readJson<CadRegistry>(cadRegistryUrl(projectId), fetcher);
  if (!registry.project || !Array.isArray(registry.revisions)) throw new Error('Project revision registry is invalid.');
  const compatible = registry.revisions.filter((r) => r.models.length && r.documents.length);
  const revision = requestedRevision ? compatible.find((r) => r.revision === requestedRevision) : compatible[0];
  if (!revision) throw new Error(requestedRevision ? 'This revision does not have both a registered 3D model and editable design document.' : 'No coordinated BIM model and design document are registered for this project. Existing sources were not replaced.');
  const document = revision.documents.find((a) => a.validationStatus === 'asset-verified') || revision.documents[0];
  const model = revision.models.find((a) => a.validationStatus === 'asset-verified') || revision.models[0];
  const source = await readJson<ProjectState>(cadAssetUrl(projectId, document.id), fetcher);
  if (!source || typeof source.id !== 'string' || !Array.isArray(source.walls) || !Array.isArray(source.rooms))
    throw new Error('Saved CAD source is not an editable design document. The current canvas was retained.');
  return { project: source, registry, revision, modelUrl: cadAssetUrl(projectId, model.id) };
}
