import path from 'node:path';
import { BRAND_ASSETS_SCHEMA, resolveKeyLayout } from './keys.js';
import { inspectBrandAsset, isExcludedIntermediate } from './inspect.js';
import { formatBytesKb } from './derivatives.js';
import { assert } from './errors.js';

/**
 * Normalize promotion input into a generic manifest/plan.
 * Accepts either a full promotion spec or CLI-ish options.
 */
export function normalizePromotionSpec(input = {}) {
  const brand = String(input.brand || '').trim();
  const asset = String(input.asset || '').trim();
  const version = String(input.version || 'v1').trim();
  assert(brand, 'brand_required', 'brand is required');
  assert(asset, 'asset_required', 'asset is required');

  const inputs = Array.isArray(input.inputs)
    ? input.inputs.map((row, i) => ({
      id: row.id || `input-${i}`,
      role: row.role || 'source',
      path: row.path,
      filename: row.filename || null,
    }))
    : buildInputsFromLegacyFlags(input);

  let derivatives = Array.isArray(input.derivatives) ? [...input.derivatives] : [];
  if (!derivatives.length && Array.isArray(input.derive)) {
    derivatives = input.derive.map(parseDeriveFlag);
  }

  const destinations = input.destinations || {
    storage: input.storage
      ? input.storage
      : input.storageBinding || input.bucket
        ? {
          provider: input.bucket && !input.storageBinding ? 'cloudflare-r2' : 'cloudflare-r2',
          binding: input.storageBinding || null,
          bucket: input.bucket || null,
        }
        : null,
    delivery: input.imageDelivery || input.delivery || null,
    registry: input.registry || null,
  };

  return {
    schema: input.schema || BRAND_ASSETS_SCHEMA,
    brand,
    asset,
    version,
    naming: input.naming || (input.prefix ? { prefix: input.prefix, convention: input.convention || 'custom' } : { convention: input.convention || 'brands' }),
    inputs,
    derivatives,
    destinations,
  };
}

function buildInputsFromLegacyFlags(input) {
  const rows = [];
  if (input.source) rows.push({ id: 'source', role: 'source', path: input.source });
  if (input.mark || input.svg) rows.push({ id: 'mark', role: 'vector.mark', path: input.mark || input.svg });
  if (input.icns) rows.push({ id: 'icns', role: 'native.icon', path: input.icns });
  // Optional pre-built primary raster
  if (input.png || input.icon) rows.push({ id: 'raster-primary', role: 'raster.primary', path: input.png || input.icon });
  if (input.webp) rows.push({ id: 'webp', role: 'web.webp', path: input.webp });
  if (input.avif) rows.push({ id: 'avif', role: 'web.avif', path: input.avif });
  return rows;
}

/** Parse --derive png:1024 or webp:1024:q92 */
export function parseDeriveFlag(value) {
  const raw = String(value || '').trim();
  const parts = raw.split(':');
  const format = parts[0];
  const size = Number(parts[1]) || null;
  let quality = null;
  for (const p of parts.slice(2)) {
    if (/^q\d+$/i.test(p)) quality = Number(p.slice(1));
  }
  return {
    id: `${format}-${size || 'x'}`,
    role: format === 'webp' || format === 'avif' ? 'web' : 'raster',
    format,
    width: size,
    height: size,
    quality,
  };
}

/**
 * Plan a brand asset promotion. Pure-ish: inspects local files, no writes.
 * Delivery/storage adapters are optional for capability negotiation.
 */
export async function planBrandAssetPromotion(input = {}, options = {}) {
  const spec = normalizePromotionSpec(input);
  const delivery = options.deliveryAdapter || null;

  const inspectedInputs = [];
  const rejected = [];
  for (const row of spec.inputs) {
    if (!row.path) continue;
    if (isExcludedIntermediate(row.path)) {
      rejected.push({ path: row.path, reason: 'intermediate_artifact' });
      continue;
    }
    const inspected = inspectBrandAsset(row.path, { role: row.role });
    inspectedInputs.push({ ...row, ...inspected });
  }

  const keys = resolveKeyLayout({
    brand: spec.brand,
    asset: spec.asset,
    version: spec.version,
    naming: spec.naming,
    derivatives: spec.derivatives,
  });

  const objects = [];
  for (const row of inspectedInputs) {
    let key;
    if (row.role === 'source') key = keys.source;
    else if (row.role === 'vector.mark') key = keys.vector.mark;
    else if (row.role === 'native.icon') key = keys.native.icns;
    else if (row.role === 'raster.primary') {
      key = keys.derivatives['png-1024']
        || `${keys.prefix}/raster/${path.basename(row.path)}`;
    } else {
      key = `${keys.prefix}/${row.role.replace(/\./g, '/')}/${row.filename || path.basename(row.path)}`;
    }

    let deliveryEligible = false;
    if (delivery && typeof delivery.supports === 'function') {
      deliveryEligible = Boolean(await delivery.supports({
        contentType: row.content_type,
        role: row.role,
      }));
    }

    objects.push({
      id: row.id,
      role: row.role,
      key,
      local_path: row.path,
      content_type: row.content_type,
      bytes: row.bytes,
      size_label: formatBytesKb(row.bytes),
      sha256: row.sha256,
      width: row.width,
      height: row.height,
      alpha: row.alpha,
      // Eligibility for a delivery adapter — NOT proof of publish
      delivery_eligible: deliveryEligible,
    });
  }

  // Planned derivative slots (not yet generated — derive step fills paths)
  const plannedDerivatives = spec.derivatives.map((d) => {
    const id = d.id || `${d.format}-${d.width || d.size || 'x'}`;
    return {
      id,
      role: d.role || 'raster',
      format: d.format,
      width: d.width || d.size || null,
      height: d.height || d.size || null,
      quality: d.quality ?? null,
      key: keys.derivatives[id] || null,
      status: 'planned',
    };
  });

  const wouldWrite = {
    storage_objects: objects.length + plannedDerivatives.length + 1,
    registry_rows: objects.length + plannedDerivatives.length,
    delivery_candidates: objects.filter((o) => o.delivery_eligible).length,
    manifest: 1,
  };

  return {
    schema: BRAND_ASSETS_SCHEMA,
    capability: 'brand.plan',
    brand: spec.brand,
    asset: spec.asset,
    version: spec.version,
    naming: spec.naming,
    keys,
    inputs: inspectedInputs,
    objects,
    derivatives: plannedDerivatives,
    destinations: spec.destinations,
    rejected,
    would_write: wouldWrite,
    manifest_draft: createBrandAssetManifest({
      spec,
      keys,
      objects,
      derivatives: plannedDerivatives,
    }),
  };
}

export function createBrandAssetManifest({
  spec,
  keys,
  objects,
  derivatives,
  storage = null,
  delivery = null,
} = {}) {
  const source = objects.find((o) => o.role === 'source');
  const mark = objects.find((o) => o.role === 'vector.mark');

  // Normalize delivery — never invent CF Images identity from R2 keys
  let deliveryBlock = null;
  if (delivery) {
    const status = delivery.status
      || (delivery.dry_run ? 'planned' : null)
      || (delivery.skipped ? 'skipped' : null)
      || (delivery.ok === false ? 'failed' : null)
      || (delivery.provider_receipt?.provider_asset_id || delivery.provider_receipt?.image_id ? 'published' : null)
      || 'unknown';
    const assetId = delivery.provider_receipt?.provider_asset_id
      || delivery.provider_receipt?.image_id
      || null;
    deliveryBlock = {
      provider: delivery.provider || null,
      status,
      // Only present when status === published with real id
      provider_asset_id: status === 'published' ? assetId : null,
      account_id: status === 'published'
        ? (delivery.provider_receipt?.account_id || null)
        : (delivery.account_id || null),
      account_hash: status === 'published'
        ? (delivery.provider_receipt?.account_hash || null)
        : (delivery.account_hash || null),
      delivery_base: status === 'published'
        ? (delivery.provider_receipt?.delivery_base || null)
        : null,
      variants: status === 'published' ? (delivery.provider_receipt?.variants || []) : [],
      source: delivery.provider_receipt?.source || delivery.source || null,
      error: delivery.error || null,
      reason: delivery.reason || null,
    };
  }

  return {
    schema: BRAND_ASSETS_SCHEMA,
    brand: spec.brand,
    asset: spec.asset,
    version: spec.version,
    prefix: keys.prefix,
    convention: keys.convention,
    master: source
      ? {
        key: source.key,
        format: source.content_type,
        width: source.width,
        height: source.height,
        alpha: source.alpha,
        sha256: source.sha256,
      }
      : null,
    vector: mark ? { mark: mark.key } : null,
    derivatives: Object.fromEntries(
      (derivatives || []).filter((d) => d.key).map((d) => [d.id, { key: d.key, format: d.format, width: d.width, height: d.height }]),
    ),
    // STORAGE ≠ DELIVERY — never collapse these
    storage: storage || spec.destinations?.storage || null,
    delivery: deliveryBlock,
    destinations: spec.destinations || null,
  };
}
