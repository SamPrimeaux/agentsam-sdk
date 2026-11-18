/** Read-only adapter over the Theme Store's published catalog. No SDK-owned theme inventory. */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_DEFAULT = 'https://themes.inneranimalmedia.com';
const PREVIEW_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../apps/local-studio/frontend/public/themes'
);
const SAFE_SLUG = /^[a-z][a-z0-9-]{0,62}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+$/;
const HASH = /^[0-9a-f]{64}$/;

async function exists(file) {
  return stat(file).then(result => result.isFile()).catch(() => false);
}

export async function listThemeStoreProducts({
  fetcher = globalThis.fetch,
  storeUrl = process.env.AGENTSAM_THEME_STORE_URL || STORE_DEFAULT,
  previewRoot = PREVIEW_ROOT,
} = {}) {
  if (typeof fetcher !== 'function') throw Error('theme_store_fetch_unavailable');
  const base = new URL(storeUrl).origin;
  const response = await fetcher(new URL('/api/catalog', base), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw Error('theme_store_catalog_unavailable_' + response.status);

  const catalog = await response.json();
  if (catalog?.ok !== true || catalog.schema !== 'iam.theme-catalog.v1' ||
      !Array.isArray(catalog.products)) {
    throw Error('theme_store_catalog_invalid');
  }

  const published = catalog.products.filter(product => {
    const slug = product?.slug;
    const version = product?.version;
    const release = product?.release || {};
    return SAFE_SLUG.test(slug || '') &&
      SAFE_VERSION.test(version || '') &&
      release.status === 'published' &&
      HASH.test(release.sha256 || '') &&
      release.storageKey === 'releases/' + slug + '/' + version + '/' + release.sha256 + '.zip';
  });

  return Promise.all(published.map(async product => {
    const slug = product.slug;
    const previewReady = await exists(path.join(path.resolve(previewRoot, slug, 'demo'), 'index.html'));
    let thumbnailUrl = null;
    const image = product.cardImage || product.galleryUrls?.[0]?.url || product.iconUrl;
    if (typeof image === 'string' && image) {
      try {
        const candidate = new URL(image, base);
        if (candidate.origin === base) thumbnailUrl = candidate.href;
      } catch {}
    }

    return {
      id: 'theme.' + slug,
      sku: product.sku || null,
      slug,
      name: product.name || slug,
      category: product.category || 'Other',
      description: product.summary || '',
      package: product.publisher || 'Theme Store',
      version: product.version,
      source: 'Theme Store',
      preview_url: previewReady ? '/themes/' + slug + '/demo/' : null,
      thumbnail_url: thumbnailUrl,
      editor_url: null,
      cms_manifest_url: null,
      preview_ready: previewReady,
      download_url: null,
      download_kind: null,
      installed: false,
      purchasable: false,
      state: 'preview_only',
      install_status: 'published',
      kind: 'theme',
      preview_alias: product.previewAlias || null,
      source_preview_url: product.previewUrl || null,
      install_url: product.installUrl || null,
      release_sha256: product.release.sha256,
    };
  }));
}
