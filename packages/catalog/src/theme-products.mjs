/**
 * Read-only adapter over the Theme Store's published catalog.
 * Theme package bytes, previews and releases remain owned by Theme Store.
 */
const STORE_DEFAULT = 'https://themes.inneranimalmedia.com';
const SAFE_SLUG = /^[a-z][a-z0-9-]{0,62}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+$/;
const HASH = /^[0-9a-f]{64}$/;

function trustedPreview(value, slug, version, alias, base) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    const compact = typeof alias === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(alias) &&
      !['admin', 'api', 'auth', 'media', 'themes', 'apps', 'settings'].includes(alias) &&
      url.pathname === '/' + alias + '/';
    const allowedPath = url.pathname.startsWith('/theme-packages/' + slug + '/' + version + '/preview/') ||
      url.pathname.startsWith('/themes/' + slug + '/presets/' + slug + '/demo/') || compact;
    return url.origin === base && !url.username && !url.password && !url.search && !url.hash && allowedPath
      ? url.href : null;
  } catch { return null; }
}

export async function listThemeStoreProducts({
  fetcher = globalThis.fetch,
  storeUrl = process.env.AGENTSAM_THEME_STORE_URL || STORE_DEFAULT,
} = {}) {
  if (typeof fetcher !== 'function') throw Error('theme_store_fetch_unavailable');
  const base = new URL(storeUrl).origin;
  const response = await fetcher(new URL('/api/catalog', base), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw Error('theme_store_catalog_unavailable_' + response.status);
  const catalog = await response.json();
  if (catalog?.ok !== true || catalog.schema !== 'iam.theme-catalog.v1' || !Array.isArray(catalog.products)) {
    throw Error('theme_store_catalog_invalid');
  }

  return catalog.products.filter(product => {
    const slug = product?.slug, version = product?.version, release = product?.release || {};
    return SAFE_SLUG.test(slug || '') && SAFE_VERSION.test(version || '') &&
      release.status === 'published' && HASH.test(release.sha256 || '') &&
      release.storageKey === 'releases/' + slug + '/' + version + '/' + release.sha256 + '.zip';
  }).map(product => {
    const slug = product.slug, version = product.version;
    const previewUrl = trustedPreview(product.previewUrl, slug, version, product.previewAlias, base);
    let thumbnailUrl = null;
    const image = product.cardImage || product.galleryUrls?.[0]?.url || product.iconUrl;
    if (typeof image === 'string' && image) {
      try { const candidate = new URL(image, base); if (candidate.origin === base && !candidate.username && !candidate.password) thumbnailUrl = candidate.href; } catch {}
    }
    return {
      id: 'theme.' + slug, sku: product.sku || null, slug, name: product.name || slug,
      category: product.category || 'Other', description: product.summary || '',
      package: product.publisher || 'Theme Store', version, source: 'Theme Store',
      preview_url: previewUrl, thumbnail_url: thumbnailUrl, editor_url: null, cms_manifest_url: null,
      preview_ready: Boolean(previewUrl), download_url: null, download_kind: null,
      installed: false, purchasable: false, state: 'preview_only', install_status: 'published', kind: 'theme',
      preview_alias: product.previewAlias || null, source_preview_url: previewUrl,
      install_url: product.installUrl || null, release_sha256: product.release.sha256,
    };
  });
}
