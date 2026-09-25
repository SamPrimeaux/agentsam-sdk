/**
 * Same-origin relative path sanitizer — no product-path rewriting.
 * Alias normalization (/login → identity.login projection) is a host concern.
 */

export function sanitizeBrowserNextPath(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(s) || s.includes('://')) return null;

  let pathname = s;
  let search = '';
  const q = s.indexOf('?');
  if (q !== -1) {
    pathname = s.slice(0, q);
    search = s.slice(q);
  }
  return pathname + search;
}

/** Customer adapter may supply apexDomain override for Set-Cookie. */
export function getApexDomain(hostname, opts = {}) {
  const override = opts?.apexDomain != null ? String(opts.apexDomain).trim() : '';
  if (override) return override;
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    if (hostname.endsWith('.workers.dev') || hostname.endsWith('.pages.dev')) return '';
    return parts.slice(-2).join('.');
  }
  return hostname;
}
