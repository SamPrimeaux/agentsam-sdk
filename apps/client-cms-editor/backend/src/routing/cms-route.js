/**
 * Canonical CMS route semantics.
 *
 * The package itself owns /cms; consumers can explicitly provide another mount
 * point only when they intentionally embed the package.
 */

export const DEFAULT_CMS_BASE_PATH = '/cms';

export const CMS_RESERVED_SEGMENTS = new Set([
  'sites',
  'websites',
  'editor',
  'templates',
  'imports',
  'media',
  'pages',
  'studio',
  'online-store',
  'theme-editor',
  'settings',
  'preview',
]);

export const CMS_PANELS = new Set([
  'pages',
  'templates',
  'imports',
  'media',
  'online-store',
  'theme-editor',
  'settings',
  'preview',
]);

/**
 * @param {any} value
 * @returns {string | null}
 */
function clean(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

/**
 * @param {any} [basePath]
 * @returns {string}
 */
function normalizeBasePath(basePath = DEFAULT_CMS_BASE_PATH) {
  const raw = clean(basePath) || DEFAULT_CMS_BASE_PATH;
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/**
 * @param {any} searchParams
 * @returns {URLSearchParams}
 */
function asSearchParams(searchParams) {
  if (searchParams instanceof URLSearchParams) return searchParams;
  if (typeof searchParams === 'string') {
    return new URLSearchParams(searchParams.startsWith('?') ? searchParams.slice(1) : searchParams);
  }
  return new URLSearchParams(searchParams || undefined);
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {string | null}
 */
function siteQuery(searchParams) {
  return clean(
    searchParams.get('site') ||
      searchParams.get('project') ||
      searchParams.get('project_slug'),
  );
}

/**
 * @param {{
 *   view?: string;
 *   siteSlug?: string | null;
 *   pageId?: string | null;
 *   panel?: string;
 *   legacy?: boolean;
 *   legacyTarget?: string | null;
 * }} [params]
 */
function routeResult({
  view = 'sites',
  siteSlug = null,
  pageId = null,
  panel = 'pages',
  legacy = false,
  legacyTarget = null,
} = {}) {
  return {
    view,
    siteSlug: clean(siteSlug),
    pageId: clean(pageId),
    panel,
    legacy: Boolean(legacy),
    legacyTarget: clean(legacyTarget),
  };
}

/**
 * @param {string | null} [siteSlug]
 * @param {{ basePath?: string }} [options]
 * @returns {string}
 */
export function buildCmsHubPath(siteSlug = null, { basePath = DEFAULT_CMS_BASE_PATH } = {}) {
  const base = normalizeBasePath(basePath);
  const site = clean(siteSlug);
  return site ? `${base}?site=${encodeURIComponent(site)}` : base;
}

/**
 * @param {{ panel?: string; pageId?: string | null; siteSlug?: string | null }} [params]
 * @param {{ basePath?: string }} [options]
 * @returns {string}
 */
export function buildCmsPath(
  { panel = 'pages', pageId = null, siteSlug = null } = {},
  { basePath = DEFAULT_CMS_BASE_PATH } = {},
) {
  const base = normalizeBasePath(basePath);
  const normalizedPanel = CMS_PANELS.has(panel) ? panel : 'pages';
  const page = clean(pageId);
  const site = clean(siteSlug);
  const siteQs = site ? `?site=${encodeURIComponent(site)}` : '';

  if (normalizedPanel === 'online-store') return `${base}/online-store${siteQs}`;
  if (normalizedPanel === 'theme-editor') return `${base}/theme-editor${siteQs}`;
  if (normalizedPanel === 'templates') return `${base}/templates${siteQs}`;
  if (normalizedPanel === 'imports') return `${base}/imports${siteQs}`;
  if (normalizedPanel === 'media') return `${base}/media${siteQs}`;
  if (normalizedPanel === 'settings') return `${base}/settings${siteQs}`;
  if (normalizedPanel === 'preview') return `${base}/preview${siteQs}`;
  if (page) return `${base}/pages/${encodeURIComponent(page)}${siteQs}`;
  return `${base}/pages${siteQs}`;
}

/**
 * @param {any} [pathname]
 * @param {any} [basePath]
 * @returns {string[]}
 */
function cmsRest(pathname, basePath) {
  const normalizedPath = `/${String(pathname || '').split('?')[0].split('#')[0].split('/').filter(Boolean).join('/')}`;
  const base = normalizeBasePath(basePath);

  if (normalizedPath === base) return [];
  if (normalizedPath.startsWith(`${base}/`)) {
    return normalizedPath.slice(base.length + 1).split('/').filter(Boolean);
  }

  // Compatibility for a CMS route mounted beneath an unknown host prefix.
  const parts = normalizedPath.split('/').filter(Boolean);
  const cmsIdx = parts.indexOf('cms');
  return cmsIdx >= 0 ? parts.slice(cmsIdx + 1) : [];
}

/**
 * @param {any} pathname
 * @param {any} [searchParamsInput]
 * @param {{ basePath?: string }} [options]
 */
export function parseCmsRoute(
  pathname,
  searchParamsInput,
  { basePath = DEFAULT_CMS_BASE_PATH } = {},
) {
  const searchParams = asSearchParams(searchParamsInput);
  const rest = cmsRest(pathname, basePath);
  const siteFromQuery = siteQuery(searchParams);

  if (rest.length === 0 || rest[0] === 'sites' || rest[0] === 'websites') {
    return routeResult({
      view: siteFromQuery ? 'hub' : 'sites',
      siteSlug: siteFromQuery,
      panel: 'pages',
    });
  }

  // Legacy: /cms/editor?project=&page=
  if (rest[0] === 'editor') {
    const pageId = clean(searchParams.get('page'));
    return routeResult({
      view: 'pages',
      siteSlug: siteFromQuery,
      pageId,
      panel: 'pages',
      legacy: true,
      legacyTarget: buildCmsPath(
        { panel: 'pages', pageId, siteSlug: siteFromQuery },
        { basePath },
      ),
    });
  }

  if (rest[0] === 'pages') {
    const pageId = clean(rest[1] && rest[1] !== 'studio' ? rest[1] : searchParams.get('page'));
    return routeResult({ view: 'pages', siteSlug: siteFromQuery, pageId, panel: 'pages' });
  }

  if (rest[0] === 'templates') {
    return routeResult({
      view: 'pages',
      siteSlug: siteFromQuery,
      pageId: searchParams.get('add_to_page'),
      panel: 'templates',
    });
  }

  if (rest[0] === 'imports') {
    return routeResult({ view: 'pages', siteSlug: siteFromQuery, panel: 'imports' });
  }

  if (rest[0] === 'media') {
    return routeResult({ view: 'media', siteSlug: siteFromQuery, panel: 'media' });
  }

  if (rest[0] === 'online-store') {
    return routeResult({ view: 'online-store', siteSlug: siteFromQuery, panel: 'online-store' });
  }

  if (rest[0] === 'theme-editor') {
    return routeResult({ view: 'theme-editor', siteSlug: siteFromQuery, panel: 'theme-editor' });
  }

  if (rest[0] === 'settings') {
    return routeResult({ view: 'settings', siteSlug: siteFromQuery, panel: 'settings' });
  }

  if (rest[0] === 'preview') {
    return routeResult({ view: 'preview', siteSlug: siteFromQuery, panel: 'preview' });
  }

  // Legacy slug-in-path: /cms/{slug}/pages[/:pageId]
  const maybeSlug = clean(rest[0]);
  if (maybeSlug && !CMS_RESERVED_SEGMENTS.has(maybeSlug)) {
    const seg2 = rest[1];
    const seg3 = rest[2];
    let panel = 'pages';
    let pageId = null;

    if (seg2 === 'templates') {
      panel = 'templates';
      pageId = clean(searchParams.get('add_to_page'));
    } else if (seg2 === 'imports') {
      panel = 'imports';
    } else if (!seg2 || seg2 === 'pages' || seg2 === 'studio') {
      pageId = clean(seg3 || searchParams.get('page'));
    }

    return routeResult({
      view: 'pages',
      siteSlug: maybeSlug,
      pageId,
      panel,
      legacy: true,
      legacyTarget: buildCmsPath({ panel, pageId, siteSlug: maybeSlug }, { basePath }),
    });
  }

  return routeResult({ view: 'sites', siteSlug: siteFromQuery, panel: 'pages' });
}

/**
 * @param {any} pathname
 * @param {any} [searchParams]
 * @param {any} [options]
 * @returns {boolean}
 */
export function isCmsStudioEditorRoute(pathname, searchParams, options) {
  const parsed = parseCmsRoute(pathname, searchParams, options);
  if (parsed.view === 'sites' || parsed.view === 'hub') return false;
  return ['pages', 'theme-editor', 'online-store', 'media'].includes(parsed.view);
}

/**
 * @param {any} pathname
 * @param {any} [searchParams]
 * @param {any} [options]
 * @returns {boolean}
 */
export function isCmsEditorFullscreenRoute(pathname, searchParams, options) {
  const parsed = parseCmsRoute(pathname, searchParams, options);
  if (parsed.view === 'hub') return true;
  if (parsed.view === 'sites' && parsed.siteSlug) return true;
  return parsed.view !== 'sites';
}
