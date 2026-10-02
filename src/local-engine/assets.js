import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const ASSET_MANIFEST_SCHEMA = 'agentsam.local-model-assets.v1';
export function agentsamHome(env = process.env) {
  const configured = String(env.AGENTSAM_HOME || '').trim();
  return configured ? path.resolve(configured.replace(/^~(?=\/|$)/, os.homedir())) : path.join(os.homedir(), '.agentsam');
}
export function assetManifestPath(env = process.env) { return path.join(agentsamHome(env), 'models', 'manifest.v1.json'); }
function safeStat(file) { try { return fs.statSync(file); } catch { return null; } }
function fileId(stat) { return stat ? `${stat.dev}:${stat.ino}` : null; }
export function readAssetManifest(env = process.env) {
  const file = assetManifestPath(env);
  if (!fs.existsSync(file)) return { schema_version: ASSET_MANIFEST_SCHEMA, generated_at: null, assets: [] };
  try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); return parsed?.schema_version === ASSET_MANIFEST_SCHEMA ? parsed : { schema_version: ASSET_MANIFEST_SCHEMA, generated_at: null, assets: [] }; } catch { return { schema_version: ASSET_MANIFEST_SCHEMA, generated_at: null, assets: [] }; }
}
function writeManifest(manifest, env = process.env) {
  const file = assetManifestPath(env); fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, file); return file;
}
export function adoptAsset(file, metadata = {}, options = {}) {
  const absolute = path.resolve(file); const stat = safeStat(absolute);
  if (!stat || !stat.isFile()) throw new Error(`model asset is not a regular file: ${absolute}`);
  const env = options.env || process.env; const manifest = readAssetManifest(env);
  const asset = { id: metadata.id || crypto.createHash('sha256').update(`${absolute}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 16), engine_id: metadata.engine_id || null, model: metadata.model || path.basename(absolute), format: metadata.format || path.extname(absolute).slice(1) || 'unknown', canonical_path: absolute, reference: 'external', size_bytes: stat.size, file_id: fileId(stat), digest: metadata.digest || null, seen_at: new Date().toISOString() };
  const assets = manifest.assets.filter((row) => row.canonical_path !== absolute); assets.push(asset);
  const next = { ...manifest, schema_version: ASSET_MANIFEST_SCHEMA, generated_at: new Date().toISOString(), assets }; const manifestPath = writeManifest(next, env);
  return { asset, manifest_path: manifestPath, copied: false };
}
export function auditAssets(options = {}) {
  const env = options.env || process.env; const manifest = readAssetManifest(env);
  const assets = manifest.assets.map((asset) => { const stat = safeStat(asset.canonical_path); return { ...asset, exists: Boolean(stat), current_size_bytes: stat?.size || null, current_file_id: fileId(stat), stale: !stat || stat.size !== asset.size_bytes }; });
  const byFile = new Map(); for (const asset of assets) if (asset.file_id) byFile.set(asset.file_id, [...(byFile.get(asset.file_id) || []), asset.id]);
  return { schema_version: ASSET_MANIFEST_SCHEMA, generated_at: new Date().toISOString(), root: path.join(agentsamHome(env), 'models'), assets, duplicates: [...byFile.entries()].filter(([, ids]) => ids.length > 1).map(([file_id, ids]) => ({ file_id, asset_ids: ids })) };
}
