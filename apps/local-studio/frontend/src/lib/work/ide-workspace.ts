/**
 * Local Studio host adapters for the packaged AgentSam IDE.
 * No filesystem authority lives in the IDE package: this module binds to the
 * workspace already authorized by the Local Studio runtime.
 */
import { hashWorkspaceEntries, diffWorkspaceSnapshots, type FileWorkspace, type WorkspaceEntry,
  type WorkspaceFile, type WorkspaceSearchHit, type WorkspaceWriteResult,
  type WorkspaceSnapshot } from '@inneranimalmedia/agentsam-ide/workspace';
import { RuntimeFilesystemAdapter, ScratchWorkspaceAdapter } from './workspace-fs';
import { useWorkStore } from './store';
import { languageFromPath } from '@/lib/utils';
import type { Artifact } from '@inneranimalmedia/agentsam-local-shared';

function failure(error: string, code = 'unavailable'): never {
  throw Object.assign(new Error(error), { code });
}

function normalizeEntries(entries: Array<{path: string; kind: string; size?: number}>): WorkspaceEntry[] {
  const result = new Map<string, WorkspaceEntry>();
  for (const entry of entries) {
    if (!entry.path || entry.path.startsWith('/') || entry.path.split('/').some(part => part === '..'))
      return failure('Filesystem provider returned an invalid or out-of-root path.', 'invalid_path');
    // Symlinks must not be followed implicitly outside the trusted runtime root.
    if (entry.kind === 'symlink') continue;
    const parts = entry.path.replace(/\/$/, '').split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      result.set(parent, { path: parent, kind: 'folder' });
    }
    const path = parts.join('/');
    if (path) result.set(path, {
      path, kind: entry.kind === 'directory' ? 'folder' : 'file',
      ...(entry.kind === 'file' ? { size: entry.size, language: languageFromPath(path) } : {}),
    });
  }
  return [...result.values()];
}

export function createRuntimeIDEWorkspace(baseUrl: string, capability: string | null | undefined): FileWorkspace {
  const adapter = new RuntimeFilesystemAdapter(baseUrl, capability);
  let baseline: WorkspaceSnapshot | null = null;
  const capture = async():Promise<WorkspaceSnapshot> => {
    const listing=await adapter.list('.',true);
    if(!listing.ok)return failure(listing.error,listing.code);
    const files=listing.entries.filter(entry=>entry.kind==='file');
    if(files.some(entry=>!entry.content_hash))
      return failure('Runtime has not supplied content hashes for every file. Merkle verification requires a hash-capable runtime.', 'hash_unavailable');
    const snapshot=await hashWorkspaceEntries(files.map(entry=>({path:entry.path,hash:entry.content_hash!})));
    // A runtime digest is NOT the canonical persisted Merkle release/snapshot row.
    // Without an explicit authenticated repository+workspace binding it stays in this editor session.
    return {...snapshot,persistence:'session'};
  };
  async function read(path: string): Promise<WorkspaceFile> {
    const result = await adapter.read(path);
    if (!result.ok) return failure(result.error, result.code);
    if (!result.version || result.version === 'undefined') return failure('Runtime did not supply a valid file version.', 'missing_version');
    return { path: result.path, content: result.content, version: result.version, language: languageFromPath(result.path) };
  }
  return {
    async list(dir) {
      const result = await adapter.list(dir || '.', true);
      if (!result.ok) return failure(result.error, result.code);
      return normalizeEntries(result.entries);
    },
    read,
    async write(path, content, expectedVersion, options): Promise<WorkspaceWriteResult> {
      if (!expectedVersion && !options?.overwrite) return { ok: false, code: 'missing_version', message: 'Refusing a write without a verified disk version.' };
      try {
        const result = await adapter.write(path, content, expectedVersion, Boolean(options?.overwrite));
        if (!result.ok) return { ok: false, code: result.code || 'unavailable', message: result.error };
        if (!result.version || result.version === 'undefined') return { ok: false, code: 'missing_version', message: 'Runtime returned no version after write.' };
        return { ok: true, file: { path, content, version: result.version, language: languageFromPath(path) } };
      } catch (error) { return { ok: false, code: 'offline', message: String(error) }; }
    },
    async create(path, kind) {
      if (kind === 'folder') {
        const result = await adapter.mkdir(path);
        if (!result.ok) return failure(result.error, result.code);
        return { path, kind: 'folder' };
      }
      const result = await adapter.create(path, '');
      if (!result.ok) return failure(result.error, result.code);
      return { path, kind: 'file' };
    },
    async rename(path, destination) {
      const result = await adapter.rename(path, destination);
      if (!result.ok) return failure(result.error, result.code);
      return { path: destination, kind: 'file' };
    },
    async delete(path, expectedVersion) {
      const result = await adapter.remove(path, expectedVersion);
      if (!result.ok) return failure(result.error, result.code);
    },
    async search(query): Promise<WorkspaceSearchHit[]> {
      const result = await adapter.list('.', true);
      if (!result.ok) return failure(result.error, result.code);
      const files = result.entries.filter(item => item.kind === 'file' && /\.(tsx?|jsx?|html?|css|json|md|txt|py|sql|yaml|yml)$/i.test(item.path));
      // Do not silently return incomplete search results for a large repository.
      if (files.length > 180) return failure('This runtime has no indexed search API; use a repository search provider for large workspaces.', 'search_not_supported');
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const hits: WorkspaceSearchHit[] = [];
      for (const item of files) {
        if (hits.length >= 100) break;
        const document = await adapter.read(item.path);
        if (!document.ok || document.content.length > 500_000) continue;
        const lines = document.content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const column = lines[i]!.toLowerCase().indexOf(q);
          if (column >= 0) hits.push({ path: item.path, line: i + 1, column: column + 1, preview: lines[i]!.slice(0, 200) });
          if (hits.length >= 100) break;
        }
      }
      return hits;
    },
    async changes() {
      if(!baseline)return failure('Capture a Merkle baseline in Snapshot first; no changes are inferred without one.');
      return diffWorkspaceSnapshots(baseline,await capture());
    },
    async snapshot() {
      const result=await capture();
      baseline=result;
      return result;
    },
    async history() { return failure('This filesystem runtime does not yet expose revision history.'); },
    async restore() { return failure('This filesystem runtime does not yet support restoring revisions.'); },
    configuration: { supportedLanguages: ['typescript','javascript','html','css','json','markdown','python','sql'] },
  };
}

function sampleFiles(workspaceId: string): Artifact[] {
  return useWorkStore.getState().projects.find(item => item.id === workspaceId)?.files || [];
}

export function createTutorialIDEWorkspace(workspaceId: string): FileWorkspace {
  const adapter = new ScratchWorkspaceAdapter(
    () => sampleFiles(workspaceId),
    files => useWorkStore.getState().patchProject(workspaceId, project => ({
      ...project, files: files.map(file => ({
        ...file, kind: 'code' as const, origin: 'editor' as const,
      })),
    })),
  );
  const read = async (path: string): Promise<WorkspaceFile> => {
    const result = await adapter.read(path);
    if (!result.ok) return failure(result.error, result.code);
    return { path: result.path, content: result.content, version: result.version, language: languageFromPath(path) };
  };
  return {
    async list() {
      return normalizeEntries(sampleFiles(workspaceId).map(file => ({
        path: file.path, kind: 'file', size: file.content.length,
      })));
    },
    read,
    async write(path, content, expectedVersion) {
      const previous = await adapter.read(path);
      if (!previous.ok) return { ok: false as const, code: 'not_found', message: previous.error };
      if (previous.version !== expectedVersion) return { ok: false as const, code: 'version_conflict', message: 'Tutorial document changed; reload before writing.' };
      const result = await adapter.write(path, content);
      return { ok: true as const, file: { path, content, version: result.version, language: languageFromPath(path) } };
    },
    async create(path, kind) {
      if (kind === 'folder') return failure('Tutorial workspaces support files, not empty folders.');
      const result = await adapter.create(path);
      if (!result.ok) return failure(result.error, result.code);
      return { path, kind: 'file' as const };
    },
    async rename(path, destination) {
      const result = await adapter.rename(path, destination);
      if (!result.ok) return failure(result.error, result.code);
      return { path: destination, kind: 'file' as const };
    },
    async delete(path) {
      const result = await adapter.remove(path);
    },
    async search(query) {
      const q = query.toLowerCase();
      return sampleFiles(workspaceId).flatMap(file => file.content.split(/\r?\n/).flatMap((line, i) => {
        const column = line.toLowerCase().indexOf(q);
        return column >= 0 && q ? [{ path:file.path, line:i+1, column:column+1, preview:line.slice(0,200) }] : [];
      }));
    },
    async history() { return failure('Tutorial files have no persisted revision history.'); },
    async restore() { return failure('Tutorial workspaces do not support restoring revisions.'); },
  };
}
