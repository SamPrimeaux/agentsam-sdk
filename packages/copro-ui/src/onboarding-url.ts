/** Preserve file-style entrypoints while normalizing directory-style hosted routes. */
export function normalizeOnboardingUrl(url: string): string {
  const value = String(url || '').trim();
  if (!value) return value;
  const match = value.match(/^([^?#]*)([?#].*)?$/);
  const path = match?.[1] ?? value;
  const suffix = match?.[2] ?? '';
  if (/\.html?$/i.test(path)) return value;
  return (path.endsWith('/') ? path : `${path}/`) + suffix;
}
