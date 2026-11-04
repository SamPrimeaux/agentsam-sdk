/**
 * Read-only product discovery for the InnerAnimalMedia website Theme Store.
 * Appearance presets (cms_themes) are intentionally NOT a website catalog.
 * The Theme Store package/release manifest is the only product authority.
 * This adapter never accepts user-provided URLs or writes tenant data.
 */
import { getWebsiteThemeInstallIndex } from './studio-website-theme-install.js';

const CATALOG_URL = 'https://themes.inneranimalmedia.com/api/catalog';
const STORE_ORIGIN = 'https://themes.inneranimalmedia.com';
const SLUG = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const SHA = /^[0-9a-f]{64}$/;
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' },
});

function allowPreview(value, slug, version) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.origin === STORE_ORIGIN &&
      (u.pathname.startsWith('/theme-packages/' + slug + '/' + version + '/preview/') ||
       u.pathname.startsWith('/themes/' + slug + '/presets/' + slug + '/demo/')) ?
      u.href : null;
  } catch { return null; }
}
function normalizeTheme(p) {
  if (!p || !SLUG.test(String(p.slug || '')) || !VERSION.test(String(p.version || '')) ||
      typeof p.name !== 'string' || !p.name.trim()) return null;
  const slug = p.slug, version = p.version;
  const verified = Boolean(p.release?.status === 'published' &&
    SHA.test(String(p.release.sha256 || '')) &&
    p.release.storageKey === 'releases/' + slug + '/' + version + '/' + p.release.sha256 + '.zip');
  const image = typeof p.cardImage === 'string' &&
    /^\/previews\/[a-z0-9_-]+\.(?:webp|png|jpg|svg)$/.test(p.cardImage) ? STORE_ORIGIN + p.cardImage : null;
  return {
    slug, version,
    sku: 'iam.theme.' + slug,
    name: p.name.slice(0, 120),
    description: String(p.summary || '').slice(0, 500),
    category: String(p.category || 'Website').slice(0, 70),
    pages: Array.isArray(p.pages) ? p.pages.filter(v => typeof v === 'string').slice(0, 40) : [],
    preview_url: allowPreview(p.previewUrl, slug, version),
    thumbnail_url: image,
    detail_url: STORE_ORIGIN + '/themes/' + slug + '/',
    download_url: verified ? STORE_ORIGIN + '/api/themes/' + slug + '/' + version + '/download' : null,
    release_status: verified ? 'published' : 'preview',
    release_sha256: verified ? p.release.sha256 : null,
    // A downloadable ZIP is not proof of installation or editability.
    cms_installed: false,
  };
}
export async function handleStudioWebsiteThemeCatalog(request, accountId, env) {
  if (!accountId) return json({ ok: false, error: 'unauthorized' }, 401);
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 60, cacheEverything: true },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('store_catalog_upstream_unavailable');
    const data = await response.json();
    if (data?.ok !== true || !Array.isArray(data.products)) throw new Error('store_catalog_invalid');
    const releaseIndex = await getWebsiteThemeInstallIndex(request,env).catch(()=>[]);
    const products = data.products.map(normalizeTheme).filter(Boolean).map(product=>{
      const release = releaseIndex.find(r=>r.slug===product.slug &&
        r.version===product.version && r.sha256===product.release_sha256);
      return {
        ...product, can_install: Boolean(release),
        editable_page_count:release?.page_count || 0,
        manifest_page_count:release?.manifest_page_count || 0,
      };
    });
    if (products.length === 0) throw new Error('store_catalog_empty');
    return json({
      ok: true, source: 'themes.inneranimalmedia.com',
      catalog_url: STORE_ORIGIN, products,
    });
  } catch {
    return json({ ok: false, error: 'website_theme_store_unavailable' }, 503);
  }
}
