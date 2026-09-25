/**
 * Logical Cloudflare binding roles for AgentSam CMS / site content.
 *
 * SSOT for editable website code sections: R2 role WEBSITE_ASSETS
 *   (bucket example: agentsam-os-blueprint-content)
 * Editable field metadata: D1 (DB)
 * Edge refresh / draft cache: KV (optional, when present)
 *
 * Worker static ASSETS (wrangler "assets" → env.ASSETS.fetch) is the built
 * SPA/shell only — not the CMS page SSOT.
 *
 * Customer workers may rename bindings. Resolve by capability + alias list
 * so `agentsam init` / agents can map whatever the connected wrangler uses.
 */

export const WEBSITE_ASSETS_ROLE = 'WEBSITE_ASSETS';
export const DB_ROLE = 'DB';
export const SITE_CACHE_KV_ROLE = 'SITE_CACHE';

/** Preferred names for the R2 website/content bucket (first match wins). */
export const WEBSITE_ASSETS_ALIASES = Object.freeze([
  'WEBSITE_ASSETS',
  'SITE_ASSETS',
  'CMS_ASSETS',
  'CONTENT',
  'CONTENT_BUCKET',
  'R2_ASSETS',
]);

export const DB_ALIASES = Object.freeze(['DB', 'D1', 'DATABASE', 'CMS_DB']);

export const SITE_CACHE_KV_ALIASES = Object.freeze([
  'SITE_CACHE',
  'CMS_CACHE',
  'WEBSITE_CACHE',
  'KV',
]);

function isR2Like(binding) {
  // R2: get+put. KV also has get+put, but adds getWithMetadata — exclude those.
  if (!binding || typeof binding.get !== 'function' || typeof binding.put !== 'function') return false;
  if (typeof binding.getWithMetadata === 'function') return false;
  return true;
}

function isD1Like(binding) {
  return Boolean(binding && typeof binding.prepare === 'function');
}

function isKvLike(binding) {
  return Boolean(
    binding &&
      typeof binding.get === 'function' &&
      typeof binding.put === 'function' &&
      typeof binding.getWithMetadata === 'function'
  );
}

/**
 * @param {object} env
 * @param {{ preferredName?: string, aliases?: string[] }} [opts]
 * @returns {{ binding: object, name: string, role: string } | null}
 */
export function resolveWebsiteAssets(env, opts = {}) {
  const aliases = opts.preferredName
    ? [opts.preferredName, ...WEBSITE_ASSETS_ALIASES.filter((n) => n !== opts.preferredName)]
    : [...(opts.aliases || WEBSITE_ASSETS_ALIASES)];

  for (const name of aliases) {
    const candidate = env?.[name];
    if (isR2Like(candidate)) {
      return { binding: candidate, name, role: WEBSITE_ASSETS_ROLE };
    }
  }
  return null;
}

/**
 * Worker static assets binding (built .output/public) — fetch API only.
 * Do not treat this as CMS SSOT.
 */
export function resolveWorkerStaticAssets(env) {
  const a = env?.ASSETS;
  if (a && typeof a.fetch === 'function') return a;
  return null;
}

export function resolveDb(env, opts = {}) {
  const aliases = opts.preferredName
    ? [opts.preferredName, ...DB_ALIASES.filter((n) => n !== opts.preferredName)]
    : [...DB_ALIASES];
  for (const name of aliases) {
    const candidate = env?.[name];
    if (isD1Like(candidate)) return { binding: candidate, name, role: DB_ROLE };
  }
  return null;
}

export function resolveSiteCacheKv(env, opts = {}) {
  const aliases = opts.preferredName
    ? [opts.preferredName, ...SITE_CACHE_KV_ALIASES.filter((n) => n !== opts.preferredName)]
    : [...SITE_CACHE_KV_ALIASES];
  for (const name of aliases) {
    const candidate = env?.[name];
    if (isKvLike(candidate)) {
      return { binding: candidate, name, role: SITE_CACHE_KV_ROLE };
    }
  }
  return null;
}

/**
 * Suggest wrangler binding stubs when a connected project uses non-standard names.
 * Used by agents / `agentsam init` scaffolding — does not mutate cloud state.
 */
export function suggestWebsiteAssetsBindingScaffold({
  detectedBindingName = null,
  bucketName = 'agentsam-os-blueprint-content',
} = {}) {
  const binding = detectedBindingName || WEBSITE_ASSETS_ROLE;
  return {
    role: WEBSITE_ASSETS_ROLE,
    binding,
    aliases: WEBSITE_ASSETS_ALIASES,
    wrangler_snippet: {
      r2_buckets: [
        {
          binding,
          bucket_name: bucketName,
        },
      ],
    },
    note:
      binding === WEBSITE_ASSETS_ROLE
        ? 'Canonical AgentSam role name.'
        : `Map logical role ${WEBSITE_ASSETS_ROLE} → worker binding "${binding}" (alias-aware runtime).`,
  };
}

/** R2 key layout for a site slug (CMS code sections live here). */
export function websitePublicKey(siteSlug, relativePath) {
  const clean = String(relativePath || '')
    .replace(/^\/+/, '')
    .replace(/^public\//, '');
  return `sites/${siteSlug}/public/${clean}`;
}

export function websitePartialKey(siteSlug, partialName) {
  return `sites/${siteSlug}/partials/${partialName}.html`;
}
