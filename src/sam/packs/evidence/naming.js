import { createHash } from 'node:crypto';
import { evidenceError } from './contract.js';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const CAMEL_RE = /^[A-Z][A-Za-z0-9]{0,47}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const RUN_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}--\d{8}--[a-f0-9]{7}$/;
export const CAPTURE_FILE_RE = /^\d{2,3}-\d{2,3}-\d{2,3}[a-z]?-[A-Z][A-Za-z0-9]*\.[a-z0-9]{2,5}$/;
export const PLAIN_FILE_RE = /^[A-Z][A-Za-z0-9]{0,47}\.[a-z0-9]{2,5}$/;
export const VIEWPORT_DIR_RE = /^(mobile|tablet|desktop)-\d{3,4}x\d{3,4}$/;

// Dates and versions live in the run id and the series, never in a subject name.
const DATE_TOKEN = /(^|-)(19|20)\d{6}(-|$)/;
const VERSION_TOKEN = /(^|-)v\d+(-|$)/;

const pad = (n) => String(n).padStart(2, '0');

export const stateId = (flow, step, state) => `${pad(flow)}-${pad(step)}-${pad(state)}`;
export const flowDirName = (flow, name) => `${pad(flow)}-${name}`;

/** UTC calendar date. `compact` gives YYYYMMDD, otherwise YYYY-MM-DD. */
export function utcDate(value, compact = false) {
  const iso = new Date(value).toISOString().slice(0, 10);
  return compact ? iso.replaceAll('-', '') : iso;
}

export function assertSubject(subject) {
  if (typeof subject !== 'string' || !SLUG_RE.test(subject)) throw evidenceError('evidence_subject_invalid');
  if (DATE_TOKEN.test(subject)) throw evidenceError('evidence_subject_contains_date');
  if (VERSION_TOKEN.test(subject)) throw evidenceError('evidence_subject_contains_version');
  return subject;
}

/**
 * `<subject>--<YYYYMMDD>--<run7>`. run7 hashes the inputs plus a nonce, so ids never depend on
 * git state or any host. The subject is always caller-supplied.
 */
export function makeRunId({ subject, project, startedAt, nonce }) {
  assertSubject(subject);
  const suffix = createHash('sha256').update([subject, project, startedAt, nonce].join('\0')).digest('hex').slice(0, 7);
  return `${subject}--${utcDate(startedAt, true)}--${suffix}`;
}

/** Zero-padded, CamelCase file name; the write-time guard against bad names. */
export function captureFilename({ flow, step, state, variant, name, ext }) {
  if (variant !== undefined && !/^[a-z]$/.test(variant)) throw evidenceError('evidence_name_invalid', 'variant');
  const file = `${stateId(flow, step, state)}${variant ?? ''}-${name}.${ext}`;
  if (!CAPTURE_FILE_RE.test(file)) throw evidenceError('evidence_name_invalid', file);
  return file;
}

/** Brief and recon assets are not part of a flow: CamelCase name plus extension. */
export function plainFilename({ name, ext }) {
  const file = `${name}.${ext}`;
  if (!PLAIN_FILE_RE.test(file)) throw evidenceError('evidence_name_invalid', file);
  return file;
}

/** Keys are relative, slash-separated, never absolute, never contain "..". */
export function assertSafeKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) throw evidenceError('evidence_key_invalid');
  for (const segment of key.split('/')) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment.includes('..')) throw evidenceError('evidence_key_invalid');
  }
  return key;
}
