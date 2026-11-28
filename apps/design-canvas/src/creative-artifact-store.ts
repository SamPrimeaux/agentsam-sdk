import type { CreativeArtifact } from './creative-model';

export type CreativeStorageRecord = { contentHash: string; revision: number; snapshot: string };
type CanvasSummary = { id: string; contentHash: string; revision: number };
type Fetcher = typeof fetch;

const CREATIVE_SCHEMA = 'agentsam.creative-workspace.v1';

function canvasDocument(artifact: CreativeArtifact) {
  return {
    version: 1,
    name: artifact.name,
    host: artifact.type,
    brief: '',
    artboards: [],
    tokens: {},
    components: [],
    assets: [],
    dataRequirements: [],
    provenance: { source: 'design-canvas', creativeType: artifact.type },
    creativeWorkspace: { schema: CREATIVE_SCHEMA, artifact },
  };
}

async function jsonResponse(response: Response, label: string) {
  let body: Record<string, any> = {};
  try { body = await response.json() as Record<string, any>; } catch { /* response may be empty */ }
  if (!response.ok || body.ok === false) throw new Error(String(body.error || label + ' (' + response.status + ')'));
  return body;
}

export async function loadCreativeArtifacts(fetcher: Fetcher = fetch): Promise<{
  artifacts: CreativeArtifact[];
  records: Map<string, CreativeStorageRecord>;
}> {
  const listResponse = await fetcher('/api/work/canvases?workspace=creative', { credentials: 'same-origin' });
  const list = await jsonResponse(listResponse, 'Creative documents could not be loaded');
  const summaries = Array.isArray(list.canvases) ? list.canvases as CanvasSummary[] : [];
  const records = new Map<string, CreativeStorageRecord>();
  const artifacts: CreativeArtifact[] = [];
  for (let offset = 0; offset < summaries.length; offset += 8) {
    const batch = summaries.slice(offset, offset + 8);
    const loaded = await Promise.all(batch.map(async (summary) => {
      const response = await fetcher('/api/work/canvases/' + encodeURIComponent(summary.id), { credentials: 'same-origin' });
      const body = await jsonResponse(response, 'Creative document ' + summary.id + ' could not be opened');
      const artifact = body.document?.creativeWorkspace?.artifact as CreativeArtifact | undefined;
      if (!artifact || artifact.id !== summary.id || typeof artifact.type !== 'string') return null;
      return { artifact, record: { contentHash: summary.contentHash, revision: summary.revision, snapshot: JSON.stringify(artifact) } };
    }));
    for (const item of loaded) if (item) {
      artifacts.push(item.artifact);
      records.set(item.artifact.id, item.record);
    }
  }
  return { artifacts, records };
}

export async function persistCreativeArtifact(
  artifact: CreativeArtifact,
  existing: CreativeStorageRecord | undefined,
  fetcher: Fetcher = fetch,
): Promise<CreativeStorageRecord> {
  const creating = !existing;
  const response = await fetcher(creating ? '/api/work/canvases' : '/api/work/canvases/' + encodeURIComponent(artifact.id), {
    method: creating ? 'POST' : 'PUT',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(existing ? { 'if-match': '"' + existing.contentHash + '"' } : {}),
    },
    body: JSON.stringify(creating ? { id: artifact.id, document: canvasDocument(artifact) } : { document: canvasDocument(artifact) }),
  });
  const body = await jsonResponse(response, 'Creative document could not be saved');
  if (!body.canvas?.contentHash) throw new Error('Creative document save did not return a verified revision');
  return { contentHash: body.canvas.contentHash, revision: Number(body.canvas.revision) || 1, snapshot: JSON.stringify(artifact) };
}

export async function archiveCreativeArtifact(
  id: string,
  existing: CreativeStorageRecord,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher('/api/work/canvases/' + encodeURIComponent(id), {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'if-match': '"' + existing.contentHash + '"' },
  });
  await jsonResponse(response, 'Creative document could not be archived');
}
