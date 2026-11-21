/** AgentSam resource identity: key/door/room are separate concerns.
 * This is not an authorization grant, runtime path resolution, or project lock.
 * Consumers must independently check access to each referenced resource.
 */
export const AGENTSAM_RESOURCE_REF = 'agentsam.resource-ref.v1' as const;

export type AgentSamResourceRef =
  | { kind: 'file'; mount: string; path: string }
  | { kind: 'asset'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'project'; id: string; revision?: number };

const ident = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(v);

export function assertAgentSamResourceRef(ref: unknown): asserts ref is AgentSamResourceRef {
  const row = ref as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('agentsam_resource_ref_invalid');
  const keys = Object.keys(row);
  if (row.kind === 'file') {
    if (keys.some(k => !['kind', 'mount', 'path'].includes(k)) ||
      typeof row.mount !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(row.mount) ||
      typeof row.path !== 'string' || !row.path || row.path.length > 1024 ||
      row.path.startsWith('/') || row.path.includes('\\') || row.path.includes('\0') ||
      row.path.split('/').some(x => x === '' || x === '.' || x === '..')) {
      throw new Error('agentsam_resource_ref_file_invalid');
    }
  } else if (row.kind === 'asset' || row.kind === 'scene') {
    if (keys.some(k => !['kind', 'id'].includes(k)) || !ident(row.id)) throw new Error('agentsam_resource_ref_id_invalid');
  } else if (row.kind === 'project') {
    if (keys.some(k => !['kind', 'id', 'revision'].includes(k)) || !ident(row.id) ||
      (row.revision !== undefined && (!Number.isSafeInteger(row.revision) || (row.revision as number) < 1))) {
      throw new Error('agentsam_resource_ref_project_invalid');
    }
  } else throw new Error('agentsam_resource_ref_kind_invalid');
}
