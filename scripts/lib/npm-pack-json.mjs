// `npm pack --json` returns an array on npm <=11 and an object keyed by
// package name on npm 12+. Normalize so callers work on either.
export function packEntries(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  if ('filename' in parsed || 'files' in parsed) return [parsed];
  return Object.values(parsed);
}

export function firstPack(parsed) {
  return packEntries(parsed)[0];
}
