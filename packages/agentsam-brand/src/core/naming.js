/**
 * Semantic delivery naming — human-readable aliases.
 * Machine identity remains asset.id (ast_…). Filename is never the identity.
 *
 * Discipline: readable + contextual — never keyword-stuffed SEO spam.
 */

const STOP = new Set([
  'best', 'cheap', 'near', 'me', 'the', 'a', 'an', 'and', 'or', 'of', 'for',
  'to', 'in', 'on', 'with', 'company', 'services', 'service',
]);

export function slugifySegment(value, { maxWords = 6 } = {}) {
  const raw = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const words = raw.split('-').filter((w) => w && !STOP.has(w) && w.length < 32);
  return words.slice(0, maxWords).join('-');
}

/**
 * Build a delivery alias slug from brand + role + semantic context.
 * @example agentsam-software-workspace-hero
 */
export function buildSemanticSlug({
  brandId,
  role,
  subject = [],
  page,
  section,
  locale,
  strategy = 'semantic',
} = {}) {
  if (strategy === 'identity') {
    return null; // caller uses asset id only
  }

  const parts = [];
  if (brandId) parts.push(slugifySegment(brandId, { maxWords: 4 }));

  const roleTail = String(role || '')
    .split('.')
    .filter(Boolean)
    .slice(-2)
    .join('-');
  if (roleTail) parts.push(slugifySegment(roleTail, { maxWords: 3 }));

  const subjects = Array.isArray(subject) ? subject : [subject];
  for (const s of subjects.slice(0, 2)) {
    const seg = slugifySegment(s, { maxWords: 3 });
    if (seg && !parts.join('-').includes(seg)) parts.push(seg);
  }

  if (page) {
    const p = slugifySegment(page, { maxWords: 3 });
    if (p && !parts.includes(p)) parts.push(p);
  }
  if (section && section !== 'hero' && section !== 'main') {
    const s = slugifySegment(section, { maxWords: 2 });
    if (s && !parts.includes(s)) parts.push(s);
  }

  let slug = parts.filter(Boolean).join('-').replace(/-+/g, '-');
  if (locale && locale !== 'en' && locale !== 'en-US') {
    slug = `${slug}-${slugifySegment(locale, { maxWords: 2 })}`;
  }

  // Hard cap — readable, not a keyword dump
  const tokens = slug.split('-').filter(Boolean);
  if (tokens.length > 8) slug = tokens.slice(0, 8).join('-');
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-$/, '');

  return slug || 'asset';
}

/**
 * Width-suffixed delivery alias.
 * acme-showroom-hero-1280.avif
 */
export function buildDerivativeFilename(slug, { width, format, dpr } = {}) {
  const ext = String(format || 'webp').toLowerCase().replace('jpeg', 'jpg');
  let base = slug || 'asset';
  if (width) base = `${base}-${width}`;
  if (dpr && dpr > 1) base = `${base}@${dpr}x`;
  return `${base}.${ext}`;
}

/**
 * Reject obvious keyword-stuffed proposals.
 */
export function validateDeliveryName(name) {
  const warnings = [];
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  const parts = base.split('-').filter(Boolean);
  if (parts.length > 10) warnings.push('too_many_segments');
  if (base.length > 96) warnings.push('name_too_long');
  const spam = parts.filter((p) => STOP.has(p) || /^(seo|keyword|rank|best|cheap)$/.test(p));
  if (spam.length >= 2) warnings.push('keyword_stuffing');
  if (/^\d+$/.test(base) || /^img[_-]?\d+/i.test(base)) warnings.push('opaque_camera_name');
  return { ok: warnings.length === 0, warnings };
}

/**
 * Enrich an asset node with naming + semantic fields (non-destructive).
 */
export function applySemanticNaming(asset, context = {}) {
  const semantic = {
    subject: context.subject || asset.semantic?.subject || [],
    page: context.page || asset.semantic?.page || null,
    section: context.section || asset.semantic?.section || null,
    locale: context.locale || asset.semantic?.locale || 'en-US',
    intent: context.intent || asset.semantic?.intent || null,
  };

  const slug = buildSemanticSlug({
    brandId: context.brandId || context.brand,
    role: asset.role,
    subject: semantic.subject,
    page: semantic.page,
    section: semantic.section,
    locale: semantic.locale,
    strategy: context.strategy || 'semantic',
  });

  const check = validateDeliveryName(slug);

  return {
    ...asset,
    semantic: { ...asset.semantic, ...semantic },
    naming: {
      slug,
      strategy: context.strategy || 'semantic',
      aliases: asset.naming?.aliases || [],
      validation: check,
      ...(asset.naming || {}),
      slug, // ensure latest wins
    },
  };
}
