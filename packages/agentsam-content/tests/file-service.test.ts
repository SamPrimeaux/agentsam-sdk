import { describe, expect, it } from 'vitest';
import { createContentRuntime } from '../src/runtime/runtime.js';
import { InMemoryContentStore } from '../src/runtime/store.js';
import { matchesQuery } from '../src/core/collection.js';
import { createFileStorageService } from '../src/storage/file-service.js';
import type { AccountFileMetadata, FileByteAdapter, FileOperation, FileStorageTarget } from '../src/storage/file-contract.js';
import type { ContentAsset } from '../src/core/asset.js';

const chunks = async function* (...items: string[]) {
  for (const item of items) yield new TextEncoder().encode(item);
};
async function collect(source: AsyncIterable<Uint8Array>) {
  let result = '';
  for await (const chunk of source) result += new TextDecoder().decode(chunk);
  return result;
}
function testBackend(targetId: string, capabilities: FileOperation[] = ['read','write','delete']) {
  const bytes = new Map<string, string>();
  let next = 0;
  const adapter: FileByteAdapter = {
    targetId,
    capabilities,
    async *read(ref: string) {
      if (!bytes.has(ref)) throw new Error('missing_byte_source');
      yield new TextEncoder().encode(bytes.get(ref)!);
    },
    async write(input) {
      const data = await collect(input.bytes);
      const ref = `key-${++next}`;
      bytes.set(ref, data);
      return { ref, bytes: data.length, mime: input.mime };
    },
    async delete(ref) { bytes.delete(ref); },
  };
  return { adapter, bytes };
}
async function setup(authorized: FileOperation[] = ['list','search','read','write','copy','move','export','delete','restore']) {
  const store = new InMemoryContentStore();
  const runtime = createContentRuntime({ account: { id: 'account-1' }, identity: { type: 'human', ref: 'user-1' }, store });
  const asset = await runtime.createAsset({ origin: 'upload', source: { type: 'upload' }, filename: 'source.mov', mime: 'video/quicktime' });
  const revisions: string[] = [];
  const metadata: AccountFileMetadata = {
    async get(accountId, id) {
      const row = await store.get(id);
      return row?.accountId === accountId ? row : null;
    },
    async list(accountId, query = {}) {
      const all = (await store.all()).filter(row => row.accountId === accountId && matchesQuery(row, query)
        && (query.includeDeleted || !row.fileTrash));
      const start = Number(query.cursor ?? 0); const limit = query.limit ?? 50;
      return { assets: all.slice(start, start + limit), total: all.length,
        cursor: start + limit < all.length ? String(start + limit) : undefined };
    },
    async commit(accountId, expectedRevision, row, revision) {
      const old = await store.get(row.id);
      if (!old || old.accountId !== accountId || row.accountId !== accountId) throw new Error('account_scope_violation');
      if ((old.fileRevision ?? 0) !== expectedRevision) throw new Error('file_storage_revision_conflict');
      await store.put(row);
      revisions.push(Object.keys(revision.changes)[0]);
      await store.addRevision(revision);
    },
  };
  const local = testBackend('on-device');
  const cloud = testBackend('remote-r2');
  const targets: FileStorageTarget[] = [
    { id: 'on-device', accountId: 'account-1', provider: 'local', kind: 'native-filesystem', label: 'Device', state: 'connected', capabilities: ['read','write','delete','export'] },
    { id: 'remote-r2', accountId: 'account-1', provider: 'r2', kind: 'cloud-object', label: 'Cloud', state: 'connected', capabilities: ['read','write','delete','export'] },
  ];
  const service = createFileStorageService({
    accountId: 'account-1', actor: { type: 'human', ref: 'user-1' },
    metadata, targets, adapters: [local.adapter, cloud.adapter],
    authorize: (operation) => authorized.includes(operation),
    now: () => '2026-10-21T05:00:00.000Z',
  });
  return { service, asset, local, cloud, targets, metadata, revisions, store };
}

describe('universal account-scoped file storage', () => {
  it('uses the canonical ContentAsset, streams actual original bytes and exports without a cloud dependency', async () => {
    const { service, asset, local } = await setup();
    const saved = await service.write(asset.id, 'on-device', {
      name: 'source.mov', mime: 'video/quicktime', bytes: chunks('original-', 'file-', 'bytes'),
    });
    expect(saved.asset.id).toBe(asset.id);
    expect(saved.asset.providerRefs[0]).toMatchObject({ targetId: 'on-device', provider: 'local', role: 'original' });
    expect(await collect(await service.read(asset.id))).toBe('original-file-bytes');
    const exported = await service.export(asset.id);
    expect(exported.name).toBe('source.mov');
    expect(await collect(exported.bytes)).toBe('original-file-bytes');
    expect(local.bytes.size).toBe(1);
  });

  it('copies between providers and moves only after the cloud write and metadata commit', async () => {
    const { service, asset, local, cloud, revisions } = await setup();
    await service.write(asset.id, 'on-device', { name: 'source.mov', bytes: chunks('precious-data') });
    const copied = await service.copy(asset.id, 'remote-r2');
    expect(copied.locations).toHaveLength(2);
    expect(await collect(await service.read(asset.id, 'remote-r2'))).toBe('precious-data');
    expect(local.bytes.size).toBe(1);
    const moved = await service.move(asset.id, 'remote-r2', 'on-device');
    expect(moved.locations.map(l => l.targetId)).toEqual(['remote-r2','remote-r2']);
    expect(local.bytes.size).toBe(0);
    expect(cloud.bytes.size).toBe(2);
    expect(revisions).toEqual(['providerRefs','providerRefs','providerRefs','providerRefs']);
  });

  it('supports metadata search and reversible trash without deleting provider bytes', async () => {
    const { service, asset, local } = await setup();
    await service.write(asset.id, 'on-device', { name: 'source.mov', bytes: chunks('kept') });
    expect((await service.list({ search: 'source' })).files).toHaveLength(1);
    const deleted = await service.delete(asset.id);
    expect(deleted.deleted).toBe(true);
    expect((await service.list()).files).toHaveLength(0);
    expect((await service.list({ includeDeleted: true })).files).toHaveLength(1);
    await expect(service.read(asset.id)).rejects.toThrow('file_storage_asset_in_trash');
    expect(local.bytes.size).toBe(1);
    const restored = await service.restore(asset.id);
    expect(restored.deleted).toBe(false);
    expect(await collect(await service.read(asset.id))).toBe('kept');
  });

  it('enforces authorization, account scopes and declared target capability availability', async () => {
    const denied = await setup(['list']);
    await expect(denied.service.write(denied.asset.id, 'on-device', { name: 'x', bytes: chunks('x') })).rejects.toThrow('file_storage_permission_denied:write');
    const { service, asset, cloud, targets, metadata } = await setup();
    expect(() => createFileStorageService({ accountId: 'other', actor: { type: 'human' }, metadata,
      targets, adapters: [cloud.adapter], authorize: () => true })).toThrow('file_storage_target_account_mismatch');
    await expect(service.read(asset.id)).rejects.toThrow('file_storage_location_unresolved');
    const wrong = await setup();
    const poisoned: AccountFileMetadata = { ...wrong.metadata, get: async () => ({...wrong.asset, accountId: 'another-account'}) as ContentAsset };
    const scoped = createFileStorageService({ accountId: 'account-1', actor: { type: 'human' }, metadata: poisoned,
      targets: wrong.targets, adapters: [wrong.local.adapter, wrong.cloud.adapter], authorize: () => true });
    await expect(scoped.get(wrong.asset.id)).rejects.toThrow('file_storage_account_scope_violation');
  });

  it('refuses destructive source movement when destination write fails', async () => {
    const { service, asset, local, cloud } = await setup();
    await service.write(asset.id, 'on-device', { name: 'source.mov', bytes: chunks('keep-me') });
    cloud.adapter.write = async () => { throw new Error('destination_unavailable'); };
    await expect(service.move(asset.id, 'remote-r2')).rejects.toThrow('destination_unavailable');
    expect(await collect(await service.read(asset.id))).toBe('keep-me');
    expect(local.bytes.size).toBe(1);
  });

  it('requires the physical destination to be connected and executable', async () => {
    const { asset, local, cloud, targets, metadata } = await setup();
    const offline = createFileStorageService({
      accountId: 'account-1', actor: { type: 'human', ref: 'user-1' }, metadata,
      targets: targets.map(t => t.id === 'remote-r2' ? { ...t, state: 'requires-connection' as const } : t),
      adapters: [local.adapter, cloud.adapter], authorize: () => true,
    });
    await expect(offline.write(asset.id, 'remote-r2', { name: 'x', bytes: chunks('x') }))
      .rejects.toThrow('file_storage_target_not_connected');
    expect(cloud.bytes.size).toBe(0);
  });

  it('preserves both metadata and source bytes when the atomic revision compare fails', async () => {
    const { asset, local, cloud, metadata, targets, service } = await setup();
    await service.write(asset.id, 'on-device', { name: 'source.mov', bytes: chunks('authoritative') });
    const conflict: AccountFileMetadata = { ...metadata, commit: async () => { throw new Error('file_storage_revision_conflict'); } };
    const stale = createFileStorageService({
      accountId: 'account-1', actor: { type: 'human', ref: 'user-1' }, metadata: conflict,
      targets, adapters: [local.adapter, cloud.adapter], authorize: () => true,
    });
    await expect(stale.move(asset.id, 'remote-r2')).rejects.toThrow('file_storage_revision_conflict');
    expect(await collect(await service.read(asset.id))).toBe('authoritative');
    expect(local.bytes.size).toBe(1);
    expect(cloud.bytes.size).toBe(0);
  });

  it('never purges referenced live assets through reversible trash', async () => {
    const { asset, metadata, service } = await setup();
    const row = (await metadata.get('account-1', asset.id))!;
    const withUsage = { ...row, usage: [{ app: 'customer-site', surface: 'home.hero', live: true }] };
    await metadata.commit('account-1', 0, { ...withUsage, fileRevision: 1 }, {
      id: 'rev_live', assetId: asset.id, at: '2026-10-21T05:00:00Z', actor: { type: 'human' }, changes: {},
    });
    await expect(service.delete(asset.id)).rejects.toThrow('file_storage_live_references');
  });

});
