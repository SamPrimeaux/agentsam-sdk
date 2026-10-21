import type { ActorRef } from '../core/actor.js';
import type { ContentAsset } from '../core/asset.js';
import type { ContentQuery } from '../core/collection.js';
import type { ProviderRef } from '../core/source.js';
import { newRevisionId } from '../core/id.js';
import { evaluateDeleteSafety } from '../core/usage.js';
import type {
  AccountFileMetadata, FileByteAdapter, FileExport, FileListResult,
  FileLocation, FileOperation, FileRecord, FileStorageTarget, FileWriteInput,
} from './file-contract.js';

export interface FileStorageServiceOptions {
  accountId: string;
  actor: ActorRef;
  metadata: AccountFileMetadata;
  targets: FileStorageTarget[];
  adapters: FileByteAdapter[];
  /** Required host authorization callback; never inferred from a UI button or provider name. */
  authorize(operation: FileOperation, asset?: ContentAsset): Promise<boolean> | boolean;
  now?: () => string;
}

/** Portable file operations on top of the existing ContentAsset identity. */
export function createFileStorageService(config: FileStorageServiceOptions) {
  if (!config.accountId?.trim() || !config.actor || !config.metadata || !config.authorize) {
    throw new Error('file_storage_context_required');
  }
  const targets = new Map(config.targets.map(t => [t.id, t]));
  const adapters = new Map(config.adapters.map(a => [a.targetId, a]));
  if (targets.size !== config.targets.length || adapters.size !== config.adapters.length) {
    throw new Error('file_storage_duplicate_target');
  }
  for (const target of targets.values()) {
    if (target.accountId !== config.accountId) throw new Error('file_storage_target_account_mismatch');
  }
  for (const adapter of adapters.values()) {
    if (!targets.has(adapter.targetId)) throw new Error('file_storage_unknown_adapter_target');
  }
  const now = config.now ?? (() => new Date().toISOString());

  const allowed = async (op: FileOperation, asset?: ContentAsset) => {
    if (asset && asset.accountId !== config.accountId) throw new Error('file_storage_account_scope_violation');
    if (!(await config.authorize(op, asset))) throw new Error(`file_storage_permission_denied:${op}`);
  };
  const mustGet = async (id: string) => {
    const asset = await config.metadata.get(config.accountId, id);
    if (!asset) throw new Error('file_storage_asset_not_found');
    if (asset.accountId !== config.accountId) throw new Error('file_storage_account_scope_violation');
    return asset;
  };
  const active = (asset: ContentAsset) => {
    if (asset.fileTrash) throw new Error('file_storage_asset_in_trash');
  };
  const executable = (targetId: string, operation: FileOperation) => {
    const target = targets.get(targetId);
    const adapter = adapters.get(targetId);
    if (!target || !adapter) throw new Error('file_storage_target_not_found');
    if (target.state !== 'connected') throw new Error('file_storage_target_not_connected');
    if (!target.capabilities.includes(operation) || !adapter.capabilities.includes(operation)) {
      throw new Error(`file_storage_capability_unavailable:${operation}`);
    }
    return { target, adapter };
  };
  const locate = (asset: ContentAsset, targetId?: string): FileLocation => {
    const candidates = asset.providerRefs.filter(ref =>
      targetId ? ref.targetId === targetId : Boolean(ref.targetId));
    const candidatesByRole = candidates.slice().sort((a, b) =>
      ['original','master','backup','derivative','preview','poster','delivery'].indexOf(a.role)
      - ['original','master','backup','derivative','preview','poster','delivery'].indexOf(b.role));
    for (const ref of candidatesByRole) {
      const target = targets.get(ref.targetId!);
      if (target && target.provider === ref.provider && target.accountId === asset.accountId) {
        return { targetId: target.id, ref, kind: target.kind, online: target.state === 'connected' };
      }
    }
    throw new Error('file_storage_location_unresolved');
  };
  const projection = (asset: ContentAsset): FileRecord => {
    if (asset.filePermissions && asset.filePermissions.ownerAccountId !== asset.accountId) {
      throw new Error('file_storage_permissions_account_mismatch');
    }
    return ({
    asset,
    locations: asset.providerRefs.flatMap(ref => {
      const t = ref.targetId ? targets.get(ref.targetId) : undefined;
      return t && t.provider === ref.provider && t.accountId === config.accountId
        ? [{ targetId: t.id, ref, kind: t.kind, online: t.state === 'connected' }]
        : [];
    }),
    permissions: asset.filePermissions ?? { ownerAccountId: asset.accountId, visibility: 'private' },
    derivatives: asset.variants,
    deleted: Boolean(asset.fileTrash),
  });
  };
  const update = async (before: ContentAsset, next: ContentAsset, field: string) => {
    const expectedRevision = before.fileRevision ?? 0;
    const updated = { ...next, updatedAt: now(), fileRevision: expectedRevision + 1 };
    await config.metadata.commit(config.accountId, expectedRevision, updated, {
      id: newRevisionId(), assetId: before.id, actor: config.actor, at: now(),
      changes: { [field]: {
        from: (before as unknown as Record<string, unknown>)[field],
        to: (updated as unknown as Record<string, unknown>)[field],
      } },
    });
    return updated;
  };
  const saveToTarget = async (asset: ContentAsset, targetId: string, input: FileWriteInput) => {
    const { target, adapter } = executable(targetId, 'write');
    const stored = await adapter.write(input);
    if (!stored?.ref) throw new Error('file_storage_write_missing_ref');
    const ref: ProviderRef = {
      provider: target.provider, targetId, ref: stored.ref,
      role: asset.providerRefs.length ? 'backup' : 'original',
      bytes: stored.bytes, mime: stored.mime ?? input.mime,
    };
    try {
      const next = await update(asset, {
        ...asset,
        providerRefs: [...asset.providerRefs.filter(r => !(r.targetId === targetId && r.ref === ref.ref)), ref],
      }, 'providerRefs');
      return { asset: next, ref };
    } catch (error) {
      // Roll back only the freshly created object; never destroy an existing reference.
      if (!asset.providerRefs.some(r => r.targetId === targetId && r.ref === ref.ref)
        && adapter.capabilities.includes('delete')) await adapter.delete(ref.ref).catch(() => {});
      throw error;
    }
  };

  return {
    targets: () => [...targets.values()].map(t => ({ ...t, capabilities: [...t.capabilities] })),
    async list(query: ContentQuery & { includeDeleted?: boolean } = {}): Promise<FileListResult> {
      await allowed(query.search ? 'search' : 'list');
      const result = await config.metadata.list(config.accountId, query);
      const assets = result.assets.filter(a => {
        if (a.accountId !== config.accountId) throw new Error('file_storage_account_scope_violation');
        return query.includeDeleted || !a.fileTrash;
      });
      return { files: assets.map(projection), cursor: result.cursor, total: result.total };
    },
    async get(assetId: string): Promise<FileRecord> {
      const asset = await mustGet(assetId);
      await allowed('read', asset);
      return projection(asset);
    },
    async read(assetId: string, targetId?: string): Promise<AsyncIterable<Uint8Array>> {
      const asset = await mustGet(assetId);
      active(asset); await allowed('read', asset);
      const location = locate(asset, targetId);
      const { adapter } = executable(location.targetId, 'read');
      return adapter.read(location.ref.ref);
    },
    async export(assetId: string, targetId?: string): Promise<FileExport> {
      const asset = await mustGet(assetId);
      active(asset); await allowed('export', asset);
      const location = locate(asset, targetId);
      const { target, adapter } = executable(location.targetId, 'read');
      if (!target.capabilities.includes('export')) throw new Error('file_storage_capability_unavailable:export');
      return {
        name: asset.filename ?? asset.title ?? location.ref.ref,
        mime: asset.mime ?? location.ref.mime,
        bytes: adapter.read(location.ref.ref), targetId: location.targetId,
      };
    },
    async write(assetId: string, targetId: string, input: FileWriteInput): Promise<FileRecord> {
      const asset = await mustGet(assetId);
      active(asset); await allowed('write', asset);
      const result = await saveToTarget(asset, targetId, input);
      return projection(result.asset);
    },
    async copy(assetId: string, toTargetId: string, fromTargetId?: string): Promise<FileRecord> {
      const asset = await mustGet(assetId);
      active(asset); await allowed('copy', asset);
      const location = locate(asset, fromTargetId);
      if (location.targetId === toTargetId) throw new Error('file_storage_same_target');
      const { adapter: source } = executable(location.targetId, 'read');
      const result = await saveToTarget(asset, toTargetId, {
        name: asset.filename ?? asset.id, mime: asset.mime, bytes: source.read(location.ref.ref),
      });
      return projection(result.asset);
    },
    async move(assetId: string, toTargetId: string, fromTargetId?: string): Promise<FileRecord> {
      const asset = await mustGet(assetId);
      active(asset); await allowed('move', asset);
      const location = locate(asset, fromTargetId);
      if (location.targetId === toTargetId) throw new Error('file_storage_same_target');
      const { adapter: source } = executable(location.targetId, 'read');
      executable(location.targetId, 'delete');
      const copied = await saveToTarget(asset, toTargetId, {
        name: asset.filename ?? asset.id, mime: asset.mime, bytes: source.read(location.ref.ref),
      });
      // Commit durable destination-only metadata before unlinking physical source.
      // Failure to remove source can leave an orphan, but never destroys the last copy.
      const refs = copied.asset.providerRefs.filter(r => !(r.targetId === location.targetId && r.ref === location.ref.ref));
      const moved = await update(copied.asset, { ...copied.asset, providerRefs: refs }, 'providerRefs');
      try { await source.delete(location.ref.ref); }
      catch { throw new Error('file_storage_source_cleanup_pending'); }
      return projection(moved);
    },
    async delete(assetId: string): Promise<FileRecord> {
      const asset = await mustGet(assetId);
      await allowed('delete', asset);
      if (asset.fileTrash) return projection(asset);
      const safety = evaluateDeleteSafety(asset.usage);
      if (!safety.safe) throw new Error('file_storage_live_references');
      const next = await update(asset, { ...asset, fileTrash: { deletedAt: now(), deletedBy: config.actor } }, 'fileTrash');
      return projection(next);
    },
    async restore(assetId: string): Promise<FileRecord> {
      const asset = await mustGet(assetId);
      await allowed('restore', asset);
      if (!asset.fileTrash) return projection(asset);
      const next = await update(asset, { ...asset, fileTrash: undefined }, 'fileTrash');
      return projection(next);
    },
  };
}
