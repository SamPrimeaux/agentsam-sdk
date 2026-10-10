import { createHash } from 'node:crypto';
import { removeConnectedBackgroundPixels } from './background.js';
import { inspectGlb } from './glb.js';

function fail(code) { const e = new Error(code); e.code = code; throw e; }
function hash(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function assertIdentity(ctx) {
  if (!ctx?.accountId || !ctx.actorId || !ctx.installationId) fail('trusted_execution_identity_required');
}
async function getSource(store, input, ctx, { write = false } = {}) {
  assertIdentity(ctx);
  if (!store?.getOwnedAsset || (write && !store?.writeDerivative)) fail('owned_asset_store_required');
  const asset = await store.getOwnedAsset({ assetId: input.assetId, accountId: ctx.accountId, actorId: ctx.actorId, installationId: ctx.installationId });
  if (!asset || asset.accountId !== ctx.accountId) fail('asset_not_found_or_forbidden');
  if (!(asset.bytes instanceof Uint8Array || Buffer.isBuffer(asset.bytes))) fail('asset_bytes_unavailable');
  if (asset.bytes.byteLength > 50 * 1024 * 1024) fail('media_source_too_large');
  return asset;
}
async function persist(store, asset, bytes, contentType, input, ctx, transformations, metadata = {}) {
  const target = Buffer.from(bytes);
  const sourceHash = hash(Buffer.from(asset.bytes)), derivativeHash = hash(target);
  const result = await store.writeDerivative({
    accountId: ctx.accountId, actorId: ctx.actorId, installationId: ctx.installationId,
    sourceAssetId: asset.id, sourceHash, bytes: target, derivativeHash,
    contentType, transformations, metadata, idempotencyKey: input.idempotencyKey || undefined,
    preservation: 'retain_original',
  });
  if (!result?.id || result.id === asset.id) fail('derivative_not_distinct_from_original');
  return { ok: true, sourceAssetId: asset.id, sourceHash, derivativeAssetId: result.id, derivativeHash, contentType, bytes: target.byteLength, transformations, ...metadata };
}
async function getSharp(injected) {
  if (injected) return injected;
  try { const m = await import('sharp'); return m.default || m; }
  catch { return fail('sharp_runtime_not_installed'); }
}
async function imageTransform(sharp, asset, config) {
  const source = Buffer.from(asset.bytes);
  let pipeline = sharp(source, { failOn: 'warning' }).rotate();
  const operation = config.operation;
  if (operation === 'resize') {
    if (!Number.isInteger(config.width) && !Number.isInteger(config.height)) fail('resize_dimensions_required');
    pipeline = pipeline.resize({ width: config.width, height: config.height, fit: config.fit || 'inside', withoutEnlargement: config.allowUpscale !== true });
  } else if (operation === 'crop') {
    const { left, top, width, height } = config;
    if (![left, top, width, height].every(Number.isInteger) || left < 0 || top < 0 || width < 1 || height < 1) fail('invalid_crop_rectangle');
    pipeline = pipeline.extract({ left, top, width, height });
  } else if (operation === 'trim_alpha') pipeline = pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
  else if (operation === 'normalize_color') pipeline = pipeline.toColourspace('srgb');
  else if (!['optimize', 'convert'].includes(operation)) fail('unsupported_image_operation');
  const format = (config.format || (operation === 'optimize' ? 'webp' : 'png')).toLowerCase();
  const quality = Number.isInteger(config.quality) ? Math.min(100, Math.max(1, config.quality)) : 82;
  if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (format === 'webp') pipeline = pipeline.webp({ quality });
  else if (format === 'jpeg' || format === 'jpg') pipeline = pipeline.jpeg({ quality });
  else fail('unsupported_output_format');
  return { bytes: await pipeline.toBuffer(), contentType: format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : `image/${format}` };
}

/** All handlers are real, but only install when an authorized asset store exists. */
export function createMediaHandlers({ assetStore, sharp: suppliedSharp, subjectSegmenter, imageProvider, imageEditEnabled = false } = {}) {
  const handlers = {};
  if (assetStore?.getOwnedAsset && assetStore?.writeDerivative) {
    handlers['media.image.background.remove'] = async (input, ctx) => {
      const source = await getSource(assetStore, input, ctx, { write: true });
      if (input.method === 'subject_ai') {
        if (typeof subjectSegmenter !== 'function') fail('subject_segmentation_provider_unavailable');
        const result = await subjectSegmenter({ bytes: Buffer.from(source.bytes), asset: source, ctx, signal: ctx.signal });
        if (!result?.bytes || result.contentType !== 'image/png') fail('invalid_segmentation_result');
        return persist(assetStore, source, result.bytes, 'image/png', input, ctx, ['background.remove.subject_ai'], { method: 'subject_ai' });
      }
      if (input.method && input.method !== 'flat_connected') fail('unknown_background_method');
      const sharp = await getSharp(suppliedSharp);
      const metadata = await sharp(Buffer.from(source.bytes), { failOn: 'warning' }).metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > 10_000_000) fail('background_removal_pixel_limit');
      const decoded = await sharp(Buffer.from(source.bytes), { failOn: 'warning' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { data, info } = decoded;
      if (info.channels !== 4) fail('expected_rgba_after_decode');
      const removal = removeConnectedBackgroundPixels(data, info.width, info.height, { tolerance: input.tolerance ?? 42 });
      const bytes = await sharp(Buffer.from(removal.pixels), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
      return persist(assetStore, source, bytes, 'image/png', input, ctx, ['background.remove.flat_connected'], { method: 'flat_connected', removedPixels: removal.removedPixels, width: info.width, height: info.height });
    };
    handlers['media.asset.background.remove'] = handlers['media.image.background.remove']; // legacy alias, catalog should advertise only canonical
  }
  if (assetStore?.getOwnedAsset) {
    handlers['media.image.inspect'] = async (input, ctx) => {
      const source = await getSource(assetStore, input, ctx);
      const sharp = await getSharp(suppliedSharp);
      const meta = await sharp(Buffer.from(source.bytes), { failOn: 'warning' }).metadata();
      return { ok: true, assetId: source.id, format: meta.format, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha, colourspace: meta.space, bytes: source.bytes.byteLength };
    };
  }
  if (assetStore?.getOwnedAsset && assetStore?.writeDerivative) {
    for (const name of ['optimize', 'resize', 'crop', 'convert', 'trim_alpha', 'normalize_color']) {
      const operation = name === 'normalize_color' ? 'normalize_color' : name;
      handlers[`media.image.${name}`] = async (input, ctx) => {
        const source = await getSource(assetStore, input, ctx, { write: true });
        const sharp = await getSharp(suppliedSharp);
        const transformed = await imageTransform(sharp, source, { ...input, operation });
        return persist(assetStore, source, transformed.bytes, transformed.contentType, input, ctx, [`image.${name}`]);
      };
    }
  }
  if (assetStore?.getOwnedAsset) {
    handlers['media.model.inspect'] = async (input, ctx) => {
      const source = await getSource(assetStore, input, ctx);
      return { assetId: source.id, ...inspectGlb(source.bytes) };
    };
    handlers['media.model.validateStructural'] = handlers['media.model.inspect']; // no claim of Khronos conformance
  }
  if (typeof imageProvider === 'function') {
    for (const [name, legacy] of [['media.image.generate', 'imgx_generate_image'], ...(imageEditEnabled ? [['media.image.edit', 'imgx_edit_image']] : [])]) {
      handlers[name] = async (input, ctx) => {
        assertIdentity(ctx);
        if (!String(input.prompt || '').trim()) fail('prompt_required');
        const safe = { ...input };
        // The host's verified identity is authoritative; model-provided IDs are ignored.
        for (const key of ['accountId', 'account_id', 'tenantId', 'tenant_id', 'userId', 'user_id', 'actorId', 'workspaceId']) delete safe[key];
        const output = await imageProvider(legacy, safe, ctx);
        if (output?.ok === false || (!output?.image_url && !output?.preview_url)) fail('image_provider_missing_result');
        return output;
      };
    }
  }
  return handlers;
}
