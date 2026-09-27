/**
 * BrandPack v2 — brand.pack.json is the source of truth.
 * ZIP / localhost preview / production publish are compiled representations.
 *
 * Schema id: agentsam.brand-pack.v2
 */

export const BRAND_PACK_SCHEMA = 'agentsam.brand-pack.v2';
export const BRAND_PACK_SCHEMA_URL = 'https://agentsam.dev/schemas/brand-pack/v2.json';
export const BRAND_PACK_FILENAME = 'brand.pack.json';

/** Empty brand graph — never seeds product identity. */
export function createEmptyBrandPack({ brandId = '', brandName = '' } = {}) {
  const id = String(brandId || '').trim().toLowerCase();
  return {
    $schema: BRAND_PACK_SCHEMA_URL,
    schema: BRAND_PACK_SCHEMA,
    brand: {
      id: id || null,
      name: brandName || null,
    },
    concept: {
      position: null,
      personality: [],
      principles: [],
    },
    assets: [],
    tokens: {
      color: {},
      type: {},
      space: {},
      radius: {},
      motion: {},
    },
    rules: {
      logo: {},
      color: {},
      type: {},
      imagery: {},
    },
    delivery: {
      images: 'cloudflare-images',
      video: 'cloudflare-stream',
      objects: 'r2',
      policy: 'role_canonical', // replaces flat canonical_png — chosen per role
    },
    platforms: {
      web: {},
      pwa: {},
      ios: {},
      android: {},
      macos: {},
    },
    validation: {
      warnings: [],
      errors: [],
    },
    provenance: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sources: [],
      operations: [],
    },
  };
}

/**
 * Normalize / migrate a pack document (v1 folder manifests → v2 graph).
 */
export function normalizeBrandPack(input = {}) {
  if (!input || typeof input !== 'object') {
    return createEmptyBrandPack();
  }

  // v1 pack manifest (single-asset) → wrap into graph
  const isV1 = input.schema === 'agentsam.brand-pack.v1'
    || (typeof input.brand === 'string' && input.asset && !Array.isArray(input.assets));
  if (isV1) {
    const pack = createEmptyBrandPack({
      brandId: typeof input.brand === 'string' ? input.brand : input.brand?.id,
      brandName: typeof input.brand === 'object' ? input.brand?.name : null,
    });
    if (input.asset) {
      pack.assets.push({
        id: `asset_${input.asset}`,
        role: inferRoleFromAssetId(input.asset),
        version: input.version || 'v1',
        master: null,
        derivatives: [],
        seo: input.seo || null,
        provenance: { migrated_from: 'agentsam.brand-pack.v1' },
      });
    }
    if (input.format_capabilities) {
      pack.provenance.migrated_capabilities = true;
    }
    return pack;
  }

  const pack = createEmptyBrandPack({
    brandId: input.brand?.id || (typeof input.brand === 'string' ? input.brand : ''),
    brandName: input.brand?.name || '',
  });

  Object.assign(pack.brand, input.brand || {});
  if (typeof input.brand === 'string') {
    pack.brand.id = input.brand;
  }
  Object.assign(pack.concept, input.concept || {});
  pack.assets = Array.isArray(input.assets) ? input.assets.map(normalizeAssetNode) : [];
  pack.tokens = {
    color: { ...(input.tokens?.color || {}) },
    type: { ...(input.tokens?.type || {}) },
    space: { ...(input.tokens?.space || {}) },
    radius: { ...(input.tokens?.radius || {}) },
    motion: { ...(input.tokens?.motion || {}) },
  };
  pack.rules = { ...pack.rules, ...(input.rules || {}) };
  pack.delivery = { ...pack.delivery, ...(input.delivery || {}) };
  pack.platforms = { ...pack.platforms, ...(input.platforms || {}) };
  pack.validation = {
    warnings: [...(input.validation?.warnings || [])],
    errors: [...(input.validation?.errors || [])],
  };
  pack.provenance = {
    ...pack.provenance,
    ...(input.provenance || {}),
    updated_at: new Date().toISOString(),
  };
  pack.schema = BRAND_PACK_SCHEMA;
  pack.$schema = BRAND_PACK_SCHEMA_URL;
  return pack;
}

function inferRoleFromAssetId(asset) {
  const a = String(asset || '').toLowerCase();
  if (a.includes('favicon')) return 'favicon';
  if (a.includes('logo')) return 'logo.primary';
  if (a.includes('og') || a.includes('social')) return 'social.og';
  if (a.includes('icon') || a.includes('app-icon')) return 'icon.app';
  if (a.includes('hero')) return 'hero.landscape';
  return 'asset.generic';
}

export function normalizeAssetNode(row = {}) {
  return {
    id: row.id || `asset_${Date.now().toString(36)}`,
    role: row.role || 'asset.generic',
    family: row.family || null,
    version: row.version || 'v1',
    label: row.label || null,
    master: row.master || null,
    // Semantic buckets — not a flat size ladder
    variants: row.variants || {
      master: null,
      raster_fallbacks: [],
      delivery: [],
      platform: [],
    },
    derivatives: Array.isArray(row.derivatives) ? row.derivatives : [],
    // Content / CMS graph context (machine identity ≠ delivery filename)
    semantic: row.semantic || {
      subject: [],
      page: null,
      section: null,
      locale: null,
      intent: null,
    },
    naming: row.naming || {
      slug: null,
      strategy: 'semantic',
      aliases: [],
    },
    usage: row.usage || null,
    seo: row.seo || {
      alt: null,
      title: null,
      caption: null,
    },
    focalPoint: row.focalPoint || null,
    safeArea: row.safeArea || null,
    artDirection: row.artDirection || null,
    licensing: row.licensing || null, // critical for fonts
    delivery: row.delivery || null,
    providerMetadata: row.providerMetadata || {},
    provenance: row.provenance || null,
    validation: row.validation || null,
  };
}

export function touchProvenance(pack, operation) {
  const next = { ...pack };
  next.provenance = {
    ...next.provenance,
    updated_at: new Date().toISOString(),
    operations: [
      ...(next.provenance?.operations || []),
      {
        at: new Date().toISOString(),
        ...operation,
      },
    ].slice(-200),
  };
  return next;
}

export function findAssetsByRole(pack, role) {
  return (pack.assets || []).filter((a) => a.role === role || String(a.role || '').startsWith(`${role}.`));
}
