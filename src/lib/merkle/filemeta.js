import { createHash } from 'node:crypto';
import { comparePaths } from './hash.js';

export const FILEMETA_FORMAT = 'agentsam-filemeta';
export const FILEMETA_VERSION = 1;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function semanticDigest(type, value) {
  return 'sha256:' + createHash('sha256')
    .update(`agentsam-filemeta:${type}:v1\0`)
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function metadataRoot(entries, classifier) {
  return semanticDigest('root', { classifier, entries: [...entries].sort((a, b) => comparePaths(a.path, b.path)) });
}

export function validateSemanticMetadata(value, contentEntries = []) {
  const fail = (message) => { throw new Error(`Invalid semantic metadata: ${message}`); };
  if (!value || value.format !== FILEMETA_FORMAT || value.version !== FILEMETA_VERSION || value.algorithm !== 'sha256') fail('unsupported format/version');
  if (!value.classifier || !Array.isArray(value.entries)) fail('missing classifier/entries');
  const content = new Map(contentEntries.filter((entry) => entry.type !== 'directory').map((entry) => [entry.path, entry]));
  const seen = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry.path !== 'string' || seen.has(entry.path)) fail('invalid/duplicate path');
    seen.add(entry.path);
    if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) fail(`invalid mode: ${entry.path}`);
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.hash || '')) fail(`invalid hash: ${entry.path}`);
    const source = content.get(entry.path);
    if (source && source.hash !== entry.hash) fail(`content hash mismatch: ${entry.path}`);
    if (source?.type === 'file' && source.size !== entry.size) fail(`file size mismatch: ${entry.path}`);
  }
  if (content.size && seen.size !== content.size) fail('entry count does not match content tree');
  const rootHash = metadataRoot(value.entries, value.classifier);
  if (rootHash !== value.rootHash) fail('metadata root mismatch');
  return { ...value, rootHash, entries: [...value.entries].sort((a, b) => comparePaths(a.path, b.path)) };
}
