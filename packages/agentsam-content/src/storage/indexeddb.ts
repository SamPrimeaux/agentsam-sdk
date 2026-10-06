/**
 * IndexedDB-backed local content storage. Same ContentStore/ContentProvider
 * contracts as Cloudflare, SQLite, and memory adapters; suitable for hosted
 * Local Studio and packaged Tauri without a remote credential.
 *
 * Metadata, revisions, and ORIGINAL FILE BYTES survive runtime re-creation.
 * The database is scoped by account; no demo data or platform token fallback.
 */
import type { ContentAsset } from '../core/asset.js';
import { matchesQuery, type ContentQuery } from '../core/collection.js';
import type { ContentRevision } from '../core/revision.js';
import type { ContentStore } from '../runtime/store.js';
import type { ContentProvider } from '../providers/types.js';

interface StoredObject {
  key: string;
  accountId: string;
  ref: string;
  name: string;
  mime?: string;
  bytes: Uint8Array;
  meta?: Record<string, string>;
  createdAt: string;
}
let connection: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  return connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('agentsam-content-persistent-v1', 1);
    request.onupgradeneeded = () => {
      for (const name of ['assets', 'revisions', 'objects']) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: name === 'objects' ? 'key' : 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}

async function query<T>(table: string, mode: IDBTransactionMode, apply: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(table, mode);
    const request = apply(transaction.objectStore(table));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error || new Error('content_persistence_transaction_aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('content_persistence_transaction_failed'));
  });
}
const read = <T>(table: string, key: IDBValidKey) => query<T>(table, 'readonly', (store) => store.get(key));
const readAll = <T>(table: string) => query<T[]>(table, 'readonly', (store) => store.getAll());
const write = <T>(table: string, value: T) => query<IDBValidKey>(table, 'readwrite', (store) => store.put(value));
const remove = (table: string, key: IDBValidKey) => query<undefined>(table, 'readwrite', (store) => store.delete(key));

export function createIndexedDbContentStorage(accountId: string): {
  store: ContentStore;
  provider: ContentProvider;
} {
  if (!accountId?.trim()) throw new Error('content_storage_account_required');
  const bytes = new Map<string, StoredObject>();
  const urls = new Map<string, string>();
  const objectKey = (ref: string) => accountId + ':' + ref;
  let warming: Promise<void> | undefined;
  const ready = () => warming ||= readAll<StoredObject>('objects').then((objects) => {
    for (const object of objects.filter((o) => o.accountId === accountId)) bytes.set(object.ref, object);
  });

  const store: ContentStore = {
    async get(id) {
      const asset = await read<ContentAsset | undefined>('assets', id);
      return asset?.accountId === accountId ? asset : null;
    },
    async put(asset) {
      if (asset.accountId !== accountId) throw new Error('content_storage_account_mismatch');
      await write('assets', asset);
    },
    async delete(id) {
      const asset = await this.get(id);
      if (!asset) throw new Error('content_asset_not_found');
      await remove('assets', id);
      // Delete only local blobs belonging to this account; never mutate remote R2.
      for (const ref of asset.providerRefs.filter((item) => item.provider === 'local')) {
        await provider.delete(ref.ref);
      }
    },
    async list(options: ContentQuery = {}) {
      // Rehydrate original bytes before returning metadata so synchronous
      // deliveryUrl() can render a thumbnail immediately after the list loads.
      await ready();
      const all = (await readAll<ContentAsset>('assets'))
        .filter((asset) => asset.accountId === accountId && matchesQuery(asset, options))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const start = options.cursor ? Number(options.cursor) : 0;
      const limit = options.limit ?? 50;
      return { assets: all.slice(start, start + limit), total: all.length,
        cursor: start + limit < all.length ? String(start + limit) : undefined };
    },
    async addRevision(revision: ContentRevision) {
      if (!(await this.get(revision.assetId))) throw new Error('content_revision_asset_not_found');
      await write('revisions', { ...revision, accountId });
    },
    async revisions(assetId) {
      if (!(await this.get(assetId))) return [];
      return (await readAll<ContentRevision & { accountId: string }>('revisions'))
        .filter((revision) => revision.accountId === accountId && revision.assetId === assetId);
    },
    async all() {
      await ready();
      return (await readAll<ContentAsset>('assets')).filter((asset) => asset.accountId === accountId);
    },
  };

  const provider: ContentProvider = {
    name: 'local',
    kinds: ['image', 'video', 'model', 'audio', 'document', 'font'],
    capabilities: ['list', 'upload', 'delete', 'deliver', 'download', 'metadata'],
    async list(options = {}) {
      await ready();
      const all = [...bytes.values()].filter((o) => !options.prefix || o.name.startsWith(options.prefix));
      const start = options.cursor ? Number(options.cursor) : 0;
      const limit = options.limit ?? 100;
      return { objects: all.slice(start, start + limit).map(({ ref, name, mime, bytes: data, meta, createdAt }) => ({
        ref, name, mime, bytes: data.byteLength, meta, createdAt,
      })), cursor: start + limit < all.length ? String(start + limit) : undefined };
    },
    async head(ref) {
      await ready();
      const object = bytes.get(ref);
      return object ? { ref, name: object.name, mime: object.mime, bytes: object.bytes.byteLength, meta: object.meta, createdAt: object.createdAt } : null;
    },
    async upload(input) {
      await ready();
      if (!input.bytes) throw new Error('content_local_upload_requires_bytes');
      const ref = 'loc_' + crypto.randomUUID();
      const object: StoredObject = {
        key: objectKey(ref), accountId, ref, name: input.name, mime: input.mime,
        bytes: input.bytes, meta: input.meta, createdAt: new Date().toISOString(),
      };
      await write('objects', object);
      bytes.set(ref, object);
      return { provider: 'local', ref, role: 'original', mime: object.mime, bytes: object.bytes.byteLength };
    },
    async delete(ref) {
      await ready();
      const url = urls.get(ref);
      if (url) { URL.revokeObjectURL(url); urls.delete(ref); }
      await remove('objects', objectKey(ref));
      bytes.delete(ref);
    },
    deliveryUrl(ref) {
      const existing = urls.get(ref);
      if (existing) return existing;
      const object = bytes.get(ref);
      if (!object?.bytes?.byteLength) return null;
      const url = URL.createObjectURL(new Blob([object.bytes as BlobPart], { type: object.mime || 'application/octet-stream' }));
      urls.set(ref, url);
      return url;
    },
  };
  return { store, provider };
}
