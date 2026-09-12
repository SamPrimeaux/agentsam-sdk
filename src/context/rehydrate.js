import { createHash } from 'node:crypto';
import { normalizeContextItem } from './resolve.js';

function sha256(value) { return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`; }

export async function rehydrateContextRef(ref, adapter, options = {}) {
  const sourceRef = String(ref || '').trim();
  if (!sourceRef) throw new TypeError('rehydrate ref is required');
  const read = typeof adapter === 'function' ? adapter : adapter?.read?.bind(adapter);
  if (typeof read !== 'function') throw new TypeError('rehydration adapter must provide read(ref, options)');
  const maxChars = Number(options.maxChars ?? 64_000);
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('rehydration maxChars must be a positive integer');

  const raw = await read(sourceRef, { maxChars, signal: options.signal });
  if (raw == null) throw new Error(`rehydration_source_not_found:${sourceRef}`);
  const value = typeof raw === 'string' ? { content: raw } : raw;
  const content = String(value.content ?? '');
  const computedHash = sha256(content);
  const expectedHash = String(options.expectedHash || value.hash || '').trim();
  if (expectedHash && expectedHash.startsWith('sha256:') && expectedHash !== computedHash) {
    throw new Error(`rehydration_hash_mismatch:${sourceRef}`);
  }
  const bounded = content.length > maxChars ? `${content.slice(0, Math.max(0, maxChars - 1))}…` : content;
  const item = normalizeContextItem({
    ref: sourceRef,
    kind: options.kind || value.kind || 'artifact',
    hash: expectedHash || computedHash,
    priority: Number.isFinite(options.priority) ? options.priority : Number(value.priority || 0),
    content: bounded,
    chars: bounded.length,
    truncated: bounded.length < content.length,
    source_chars: content.length > bounded.length ? content.length : undefined,
  });
  return Object.freeze({ ...item, truncated: bounded.length < content.length });
}
