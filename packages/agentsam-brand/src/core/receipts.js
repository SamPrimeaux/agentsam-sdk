import fs from 'node:fs';
import path from 'node:path';
import { BrandAssetError } from './errors.js';

export function receiptDir(baseDir, { brand, asset, version }) {
  return path.join(baseDir, '.agentsam', 'brand', 'assets', brand, asset, version);
}

export function writePromotionReceipt(dir, receipt) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'promotion.json');
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return file;
}

export function loadPromotionReceipt(dir) {
  const file = path.join(dir, 'promotion.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listBrandAssetReceipts(cwd = process.cwd()) {
  const root = path.join(cwd, '.agentsam', 'brand', 'assets');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const brand of fs.readdirSync(root)) {
    const brandDir = path.join(root, brand);
    if (!fs.statSync(brandDir).isDirectory()) continue;
    for (const asset of fs.readdirSync(brandDir)) {
      const assetDir = path.join(brandDir, asset);
      if (!fs.statSync(assetDir).isDirectory()) continue;
      for (const version of fs.readdirSync(assetDir)) {
        const receipt = loadPromotionReceipt(path.join(assetDir, version));
        if (receipt) out.push(receipt);
      }
    }
  }
  return out;
}

export function requireReceipt(dir) {
  const receipt = loadPromotionReceipt(dir);
  if (!receipt) throw new BrandAssetError('receipt_missing', `Promotion receipt missing: ${dir}`);
  return receipt;
}

/**
 * Human CLI receipt — storage / delivery / registry as separate rows.
 * Never collapses them into a single "uploaded" checkmark.
 */
export function formatPublishReceipt(result = {}) {
  const lines = [];
  const overall = result.overall || (result.ok ? 'success' : 'failed');
  const title = overall === 'planned'
    ? 'Brand asset plan'
    : overall === 'partial_success'
      ? 'Brand asset partially published'
      : overall === 'success'
        ? 'Brand asset published'
        : 'Brand asset publish failed';
  lines.push(`Agent Sam · ${title}`);
  lines.push('');

  const storage = result.storage || null;
  lines.push('Storage');
  if (!storage) {
    lines.push('  — not requested');
  } else {
    const mark = storage.status === 'published' ? '✓'
      : storage.status === 'planned' ? '○'
        : storage.status === 'failed' ? '✗'
          : '—';
    const provider = storage.provider || 'unknown';
    lines.push(`  ${mark} ${labelProvider(provider)}`);
    if (storage.binding) lines.push(`    ${storage.binding}`);
    if (storage.bucket) lines.push(`    ${storage.bucket}`);
    const keys = (storage.objects || result.uploaded || []).map((o) => o.key).filter(Boolean);
    for (const k of keys.slice(0, 5)) lines.push(`    ${k}`);
    if (keys.length > 5) lines.push(`    … +${keys.length - 5} more`);
  }

  lines.push('');
  lines.push('Delivery');
  const delivery = result.delivery;
  if (!delivery) {
    lines.push('  — Cloudflare Images · not requested');
  } else {
    const mark = delivery.status === 'published' ? '✓'
      : delivery.status === 'planned' ? '○'
        : delivery.status === 'failed' ? '✗'
          : delivery.status === 'skipped' ? '—'
            : '?';
    const provider = delivery.provider || 'unknown';
    if (delivery.status === 'published') {
      const id = delivery.provider_receipt?.provider_asset_id
        || delivery.provider_receipt?.image_id
        || delivery.provider_asset_id;
      const variants = delivery.provider_receipt?.variants || delivery.variants || [];
      const hash = delivery.provider_receipt?.account_hash || delivery.account_hash;
      lines.push(`  ${mark} ${labelProvider(provider)}`);
      if (delivery.provider_receipt?.account_id || delivery.account_id) {
        lines.push(`    account    ${delivery.provider_receipt?.account_id || delivery.account_id}`);
      }
      if (hash) lines.push(`    hash       ${hash}`);
      if (id) lines.push(`    image id  ${id}`);
      if (variants.length) {
        const names = variants.map((v) => {
          try {
            const u = new URL(v);
            return u.pathname.split('/').filter(Boolean).pop() || v;
          } catch {
            return String(v);
          }
        });
        lines.push(`    variants  ${names.join(', ')}`);
      }
    } else if (delivery.status === 'planned') {
      lines.push(`  ${mark} ${labelProvider(provider)} · planned`);
    } else if (delivery.status === 'failed') {
      lines.push(`  ${mark} ${labelProvider(provider)} · ${delivery.reason || delivery.error || 'failed'}`);
    } else if (delivery.status === 'skipped') {
      lines.push(`  ${mark} ${labelProvider(provider)} · ${delivery.reason || 'skipped'}`);
    } else {
      lines.push(`  ${mark} ${labelProvider(provider)} · ${delivery.status}`);
    }
  }

  lines.push('');
  lines.push('Registry');
  const registry = result.registry;
  if (!registry || registry.status === 'skipped') {
    lines.push('  — not requested');
  } else {
    const mark = registry.status === 'published' ? '✓'
      : registry.status === 'planned' ? '○'
        : '✗';
    lines.push(`  ${mark} D1`);
  }

  if (overall === 'partial_success') {
    lines.push('');
    lines.push('Overall: partial_success (layers reported independently)');
  }

  return lines.join('\n');
}

function labelProvider(provider) {
  if (provider === 'cloudflare-r2') return 'Cloudflare R2';
  if (provider === 'cloudflare-images') return 'Cloudflare Images';
  if (provider === 'filesystem') return 'Local filesystem';
  if (provider === 'memory') return 'In-memory';
  if (provider === 'plan_only') return 'Plan only';
  return provider;
}
