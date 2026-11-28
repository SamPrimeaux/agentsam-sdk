type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const repository = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.trim());
const account = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 180;
const ref = (value: unknown) => typeof value === 'string' && value.length <= 160 &&
  /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes('..') && !value.startsWith('/') && !value.endsWith('/') && !value.includes('//');
const empty = (value: unknown) => value === undefined || value === null || value === '';
const only = (value: RecordValue, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

/** Validate configuration, never a copied PR/test snapshot. Empty values allow incremental editing. */
export function validReleaseWidgetConfiguration(key: string, value: unknown): boolean {
  if (!object(value)) return false;
  if (key === 'pull-request-summary') {
    if (!only(value,['repository','pullNumber','githubAccount'])) return false;
    if (!empty(value.repository) && !repository(value.repository)) return false;
    if (!empty(value.pullNumber) && (!Number.isSafeInteger(Number(value.pullNumber)) || Number(value.pullNumber) < 1 || Number(value.pullNumber) > 1_000_000)) return false;
    if (!empty(value.githubAccount) && !account(value.githubAccount)) return false;
    return true;
  }
  if (key === 'release-readiness') {
    if (!only(value,['repository','ref','githubAccount'])) return false;
    if (!empty(value.repository) && !repository(value.repository)) return false;
    if (!empty(value.ref) && !ref(value.ref)) return false;
    if (!empty(value.githubAccount) && !account(value.githubAccount)) return false;
    return true;
  }
  return false;
}
