import { assert } from './errors.js';

export const BRAND_ASSETS_SCHEMA = 'agentsam.brand-asset-promotion.v1';

function cleanSegment(value, label) {
  const s = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  assert(s, `${label}_required`, `${label} is required`);
  assert(!s.includes('..') && !s.startsWith('/') && !s.includes('\\'), `${label}_invalid`, `Invalid ${label}`);
  return s;
}

/**
 * Default key prefix: brands/<brand>/<asset>/<version>
 * Override with naming.prefix or naming.convention callback.
 */
export function brandAssetPrefix({ brand, asset, version, naming = {} } = {}) {
  if (naming.prefix) {
    return String(naming.prefix).replace(/^\/+|\/+$/g, '');
  }
  if (typeof naming.prefixFn === 'function') {
    return String(naming.prefixFn({ brand, asset, version })).replace(/^\/+|\/+$/g, '');
  }
  const b = cleanSegment(brand, 'brand');
  const a = cleanSegment(asset, 'asset');
  const v = cleanSegment(version, 'version');
  return `brands/${b}/${a}/${v}`;
}

function leafFor(assetId, kind, dims = {}) {
  const asset = cleanSegment(assetId, 'asset');
  const w = dims.width || dims.size || null;
  if (kind === 'master') return `${asset}-master.png`;
  if (kind === 'mark') return `${asset}-mark.svg`;
  if (kind === 'icns') return `${asset}.icns`;
  if (kind === 'png' && w) return `${asset}-${w}.png`;
  if (kind === 'webp' && w) return `${asset}-${w}.webp`;
  if (kind === 'avif' && w) return `${asset}-${w}.avif`;
  if (kind === 'jpeg' && w) return `${asset}-${w}.jpg`;
  return `${asset}.${kind}`;
}

/**
 * Resolve R2/object keys from identity + optional naming strategy.
 * NO brand/asset identity branches — leaf names are generic or explicit.
 */
export function resolveKeyLayout({
  brand,
  asset,
  version,
  naming = {},
  derivatives = [],
} = {}) {
  const base = brandAssetPrefix({ brand, asset, version, naming });
  const assetId = cleanSegment(asset, 'asset');
  const files = typeof naming.files === 'function'
    ? naming.files({ brand, asset: assetId, version, base })
    : (naming.files || {});

  const layout = {
    prefix: base,
    convention: naming.convention || 'brands',
    source: `${base}/source/${files.source || leafFor(assetId, 'master')}`,
    vector: {
      mark: `${base}/vector/${files.mark || leafFor(assetId, 'mark')}`,
    },
    native: {
      icns: `${base}/native/${files.icns || leafFor(assetId, 'icns')}`,
    },
    derivatives: {},
    manifest: `${base}/manifest.json`,
  };

  for (const d of derivatives) {
    const id = d.id || `${d.format}-${d.width || d.size || 'x'}`;
    const folder = d.role === 'web' || d.format === 'webp' || d.format === 'avif' ? 'web' : 'raster';
    const filename = d.filename
      || files[id]
      || leafFor(assetId, d.format, { width: d.width || d.size, height: d.height || d.size });
    layout.derivatives[id] = `${base}/${folder}/${filename}`;
  }

  return Object.freeze(layout);
}
