/**
 * Installation-scoped durable Node media store for local AgentSam operation packs.
 * The host explicitly chooses the root and resolves the authenticated principal.
 * Source assets are immutable; derivatives get new IDs, files and lineage records.
 * This is a local adapter, NOT a Worker R2/D1 storage substitute.
 */
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ident = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('invalid_media_resource_identifier');
  }
  return value;
};

export function createLocalMediaStore({ root } = {}) {
  if (!root || !path.isAbsolute(root)) throw new Error('absolute_media_store_root_required');
  const base = path.resolve(root);
  const directory = (accountId, installationId) => path.join(base, ident(accountId), ident(installationId));
  const assetFile = (dir, id) => path.join(dir, ident(id) + '.bin');
  const metaFile = (dir, id) => path.join(dir, ident(id) + '.json');

  async function getOwnedAsset({ assetId, accountId, installationId }) {
    const dir = directory(accountId, installationId);
    const id = ident(assetId);
    let meta, bytes;
    try {
      [meta, bytes] = await Promise.all([
        readFile(metaFile(dir,id), 'utf8').then(JSON.parse),
        readFile(assetFile(dir,id)),
      ]);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    if (meta.accountId !== accountId || meta.installationId !== installationId ||
        meta.id !== id || hash(bytes) !== meta.sha256) throw new Error('media_integrity_or_scope_mismatch');
    return { ...meta, bytes };
  }
  async function store({ accountId, installationId, bytes, contentType, sourceAssetId = null,
                         sourceHash = null, derivativeHash = null, transformations = [], metadata = {} }) {
    const dir = directory(accountId, installationId);
    const original = sourceAssetId ? await getOwnedAsset({ assetId: sourceAssetId, accountId, installationId }) : null;
    if (sourceAssetId && !original) throw new Error('media_source_not_found_or_forbidden');
    if (original && sourceHash !== original.sha256) throw new Error('media_source_version_conflict');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 50*1024*1024) {
      throw new Error('media_bytes_invalid');
    }
    const data = Buffer.from(bytes);
    if (derivativeHash && derivativeHash !== hash(data)) throw new Error('derivative_hash_mismatch');
    const id = 'ast_' + randomUUID().replaceAll('-','');
    const document = {
      id, accountId, installationId, contentType: String(contentType || 'application/octet-stream'),
      sha256: hash(data), byteLength: data.byteLength, sourceAssetId,
      sourceHash: original?.sha256 || null, transformations,
      metadata, createdAt: new Date().toISOString(),
    };
    await mkdir(dir, { recursive: true });
    await writeFile(assetFile(dir,id), data, { flag: 'wx', mode: 0o600 });
    await writeFile(metaFile(dir,id), JSON.stringify(document, null, 2), { flag: 'wx', mode: 0o600 });
    return { id, ...document };
  }
  return Object.freeze({
    importAsset: (input) => store(input),
    getOwnedAsset,
    writeDerivative: (input) => store(input),
  });
}
