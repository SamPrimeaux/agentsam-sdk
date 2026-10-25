import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import {createEmptyCadProject} from './create-empty-project';

export interface CadAsset { id: string; name: string; status: string; validationStatus: string; contentHash: string | null; stale?: boolean }
export interface CadRevision { revision: string; status: string; updatedAt: number; label?: string; parentRevision?: string; bimRevision?: string | null; sceneRevision?: string | null; models: CadAsset[]; documents: CadAsset[]; native: CadAsset[] }
export interface CadRegistry { project: { id: string; name: string }; access?: { canWrite: boolean }; revisions: CadRevision[] }
export interface CadHostedSelection { project: ProjectState | null; registry: CadRegistry; revision: CadRevision; modelUrl: string }

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
  const compatible = registry.revisions.filter((r) => r.models.length && (r.documents.length || r.revision === 'current'));
  const revision = requestedRevision ? compatible.find((r) => r.revision === requestedRevision) : compatible[0];
  if (!revision) throw new Error(requestedRevision ? 'This revision does not have both a registered 3D model and editable design document.' : 'No coordinated BIM model and design document are registered for this project. Existing sources were not replaced.');
  const model = revision.models.find((a) => a.validationStatus === 'asset-verified') || revision.models[0];
  // The latest visual scene can legitimately advance ahead of the IFC/2D review.
  // Never load an older drafting document and mislabel it as aligned V1.5 geometry.
  if (revision.revision === 'current' && !revision.documents.length) {
    if(!model.contentHash)throw new Error('The registered scene needs its source hash before edits can be saved.');
    const project:ProjectState={...createEmptyCadProject(),id:registry.project.id,name:registry.project.name,
      sceneSource:{assetId:model.id,contentHash:model.contentHash,revision:revision.sceneRevision||revision.revision,units:'m',axes:'gltf-y-up'},sceneElements:[]};
    return {project,registry,revision,modelUrl:cadAssetUrl(projectId,model.id)};
  }
  const document = revision.documents.find((a) => a.validationStatus === 'asset-verified') || revision.documents[0];
  const source = await readJson<ProjectState>(cadAssetUrl(projectId, document.id), fetcher);
  if (!source || typeof source.id !== 'string' || !Array.isArray(source.walls) || !Array.isArray(source.rooms))
    throw new Error('Saved CAD source is not an editable design document. The current canvas was retained.');
  if(source.sceneSource && (source.sceneSource.assetId!==model.id || source.sceneSource.contentHash!==model.contentHash))
    throw new Error('This document belongs to a different model source. Reconcile its scene binding before editing.');
  return { project: {...source,id:registry.project.id}, registry, revision, modelUrl: cadAssetUrl(projectId, model.id) };
}

export interface HostedSaveReceipt {
  revisionId: string; projectId: string; revisionNumber: number; timestamp: number; message: string;
  wallsCount: number; roomsCount: number; parametricCount: number;
  assetId: string; sha256: string; bytes: number; verified: boolean;
}
export const cadDocumentsUrl = (id: string, base: string) => `${cadRegistryUrl(id)}/documents?base=${encodeURIComponent(base)}`;

/** Saves an edit as a new revision of the project; the base revision is never modified. */
export async function saveHostedProject(projectId: string, project: ProjectState, baseRevision: string, fetcher: typeof fetch = fetch, expectedHash?:string): Promise<HostedSaveReceipt> {
  const res = await fetcher(cadDocumentsUrl(projectId, baseRevision), {
    method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json',...(expectedHash?{'if-match':expectedHash}:{}) }, body: JSON.stringify(project),
  });
  const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; receipt?: HostedSaveReceipt } | null;
  if (!res.ok || !data?.ok || !data.receipt)
    throw new Error(res.status === 401 ? 'Sign in to save this CAD project.' : `Save failed${data?.error ? ` (${data.error})` : ` (HTTP ${res.status})`}. Nothing was changed.`);
  return data.receipt;
}
