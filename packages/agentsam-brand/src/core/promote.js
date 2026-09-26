import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { planBrandAssetPromotion, normalizePromotionSpec, createBrandAssetManifest } from './plan.js';
import { deriveBrandAssets } from './derivatives.js';
import { inspectBrandAsset, sha256Buffer } from './inspect.js';
import { receiptDir, writePromotionReceipt, requireReceipt } from './receipts.js';
import { MemoryStorageAdapter } from '../adapters/memory.js';
import { assert } from './errors.js';

/**
 * Promote = plan + optional derive + write receipt (publish is separate).
 */
export async function promoteBrandAssets(input = {}, options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const dryRun = options.dryRun !== false && !options.publish && !options.yes
    ? true
    : Boolean(options.dryRun);

  let spec = normalizePromotionSpec(input);
  let derivedArtifacts = [];

  // Derive if requested and source exists
  const source = (spec.inputs || []).find((i) => i.role === 'source' || i.id === 'source');
  if (source?.path && spec.derivatives?.length && options.derive !== false) {
    const outDir = options.deriveDir
      || path.join(cwd, '.agentsam', 'brand', 'work', `${spec.brand}-${spec.asset}-${spec.version}`);
    const result = deriveBrandAssets({
      sourcePath: source.path,
      outDir,
      derivatives: spec.derivatives,
      asset: spec.asset,
    });
    derivedArtifacts = result.artifacts.filter((a) => a.status === 'generated');
    // Append generated artifacts as inputs for planning keys
    for (const art of derivedArtifacts) {
      spec.inputs.push({
        id: art.id,
        role: art.role === 'web' ? `web.${art.format}` : 'raster',
        path: art.path,
        filename: path.basename(art.path),
      });
    }
  }

  const plan = await planBrandAssetPromotion(spec, {
    deliveryAdapter: options.deliveryAdapter || null,
  });

  const dir = receiptDir(cwd, plan);
  const receipt = {
    ...plan,
    dry_run: dryRun,
    derived: derivedArtifacts,
    created_at: new Date().toISOString(),
  };
  const receiptPath = writePromotionReceipt(dir, receipt);
  receipt.receipt_path = receiptPath;

  if (options.publish || options.yes) {
    const published = await publishBrandAssets({
      brand: plan.brand,
      asset: plan.asset,
      version: plan.version,
      cwd,
      dryRun: Boolean(options.dryRun) && !options.forcePublish,
      storageAdapter: options.storageAdapter,
      deliveryAdapter: options.deliveryAdapter,
      registryAdapter: options.registryAdapter,
      force: options.force,
    });
    return { ...receipt, publish: published, published: !published.dry_run };
  }

  return receipt;
}

export async function publishBrandAssets(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const brand = options.brand;
  const asset = options.asset;
  const version = options.version || 'v1';
  assert(brand && asset, 'brand_and_asset_required', 'brand and asset required');

  const dir = receiptDir(cwd, { brand, asset, version });
  const receipt = options.receipt || requireReceipt(dir);
  const dryRun = Boolean(options.dryRun);
  const storage = options.storageAdapter || new MemoryStorageAdapter();

  const uploaded = [];
  const skipped = [];
  const conflicts = [];

  for (const obj of receipt.objects || []) {
    if (!obj.local_path || !fs.existsSync(obj.local_path)) continue;
    const buf = fs.readFileSync(obj.local_path);
    const localSha = obj.sha256 || sha256Buffer(buf);

    if (!dryRun && typeof storage.head === 'function') {
      const remote = await storage.head(obj.key);
      if (remote?.exists && remote.buffer) {
        const remoteSha = sha256Buffer(remote.buffer);
        if (remoteSha === localSha) {
          skipped.push({ key: obj.key, reason: 'same_sha256' });
          continue;
        }
        conflicts.push({ key: obj.key, local_sha256: localSha, remote_sha256: remoteSha });
        if (!options.force) {
          const err = new Error(`r2_sha_conflict:${obj.key}`);
          err.code = 'sha_conflict';
          throw err;
        }
      }
    }

    if (!dryRun) {
      await storage.put(obj.key, buf, {
        contentType: obj.content_type,
        sha256: localSha,
      });
    }
    uploaded.push({ key: obj.key, sha256: localSha, content_type: obj.content_type, dry_run: dryRun });
  }

  let storageResult = {
    provider: storage.kind || storage.provider || 'unknown',
    status: dryRun ? 'planned' : 'published',
    objects: uploaded,
    skipped,
    conflicts,
  };

  let deliveryResult = null;
  const delivery = options.deliveryAdapter;
  const primary = (receipt.objects || []).find((o) => o.delivery_eligible)
    || (receipt.objects || []).find((o) => o.role === 'raster.primary')
    || (receipt.objects || []).find((o) => o.role === 'source' && String(o.content_type || '').startsWith('image/'));

  if (delivery && primary && typeof delivery.upload === 'function') {
    const supported = typeof delivery.supports === 'function'
      ? await delivery.supports({ contentType: primary.content_type, role: primary.role })
      : true;
    if (!supported) {
      deliveryResult = {
        ok: true,
        provider: delivery.provider || 'unknown',
        status: 'skipped',
        reason: 'unsupported_content_type',
        content_type: primary.content_type,
      };
    } else {
      deliveryResult = await delivery.upload({
        filePath: primary.local_path,
        fileName: path.basename(primary.local_path || primary.key || 'image.png'),
        contentType: primary.content_type,
        sourceSha256: primary.sha256,
        sourceStorage: {
          provider: storage.kind || storage.provider || null,
          bucket: storage.bucket || null,
          key: primary.key,
        },
        metadata: { brand, asset, version, role: primary.role },
        dryRun,
      });
    }
  }

  const storageStatus = storageResult.status;
  const deliveryStatus = deliveryResult?.status || null;
  let overall = 'success';
  if (conflicts.length) overall = 'failed';
  else if (deliveryStatus === 'failed' && storageStatus === 'published') overall = 'partial_success';
  else if (deliveryStatus === 'failed' && dryRun) overall = 'failed';
  else if (dryRun) overall = 'planned';

  const manifest = createBrandAssetManifest({
    spec: receipt,
    keys: receipt.keys,
    objects: receipt.objects,
    derivatives: receipt.derivatives,
    storage: {
      provider: storageResult.provider,
      status: storageStatus,
      bucket: storage.bucket || null,
      binding: storage.binding || null,
    },
    delivery: deliveryResult,
  });
  const manifestKey = receipt.keys?.manifest || `brands/${brand}/${asset}/${version}/manifest.json`;
  const manifestBuf = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (!dryRun) {
    await storage.put(manifestKey, manifestBuf, { contentType: 'application/json' });
  }

  if (options.registryAdapter && typeof options.registryAdapter.register === 'function' && !dryRun) {
    for (const obj of receipt.objects || []) {
      await options.registryAdapter.register({
        brand,
        asset,
        version,
        // Explicit storage vs delivery columns — never collapse
        storage_provider: storageResult.provider,
        storage_bucket: storage.bucket || null,
        storage_key: obj.key,
        delivery_provider: deliveryResult?.status === 'published' ? deliveryResult.provider : null,
        delivery_asset_id: deliveryResult?.status === 'published'
          ? (deliveryResult.provider_receipt?.provider_asset_id || deliveryResult.provider_receipt?.image_id)
          : null,
        delivery_variants_json: deliveryResult?.status === 'published'
          ? JSON.stringify(deliveryResult.provider_receipt?.variants || [])
          : null,
        content_type: obj.content_type,
        bytes: obj.bytes,
        sha256: obj.sha256,
        width: obj.width,
        height: obj.height,
        role: obj.role,
      });
    }
  }

  const result = {
    capability: 'brand.publish',
    ok: overall === 'success' || overall === 'planned' || overall === 'partial_success',
    overall,
    dry_run: dryRun,
    brand,
    asset,
    version,
    storage: storageResult,
    delivery: deliveryResult,
    registry: options.registryAdapter ? { status: dryRun ? 'planned' : 'published' } : { status: 'skipped' },
    uploaded,
    skipped,
    conflicts,
    manifest_key: manifestKey,
    manifest,
  };
  writePromotionReceipt(dir, { ...receipt, publish: result, updated_at: new Date().toISOString() });
  return result;
}

export async function verifyBrandAssets(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const brand = options.brand;
  const asset = options.asset;
  const version = options.version || 'v1';
  assert(brand && asset, 'brand_and_asset_required', 'brand and asset required');

  const dir = receiptDir(cwd, { brand, asset, version });
  const receipt = options.receipt || requireReceipt(dir);
  const storage = options.storageAdapter || new MemoryStorageAdapter();

  const checks = [];
  for (const obj of receipt.objects || []) {
    const remote = await storage.head(obj.key);
    if (!remote?.exists) {
      checks.push({ key: obj.key, ok: false, error: 'missing' });
      continue;
    }
    if (remote.buffer && obj.sha256) {
      const remoteSha = sha256Buffer(remote.buffer);
      checks.push({
        key: obj.key,
        ok: remoteSha === obj.sha256,
        local_sha256: obj.sha256,
        remote_sha256: remoteSha,
        error: remoteSha === obj.sha256 ? null : 'sha_mismatch',
      });
    } else {
      checks.push({ key: obj.key, ok: true });
    }
  }

  const ok = checks.every((c) => c.ok !== false);
  return {
    capability: 'brand.verify',
    ok,
    brand,
    asset,
    version,
    checks,
  };
}

// avoid top-level require for crypto in publish loop - already used sha256Buffer
void os;
void inspectBrandAsset;
