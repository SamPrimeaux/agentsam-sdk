import fs from 'node:fs';
import path from 'node:path';
import { planBrandAssetPromotion } from '../core/plan.js';
import { promoteBrandAssets, publishBrandAssets, verifyBrandAssets } from '../core/promote.js';
import { inspectBrandAsset } from '../core/inspect.js';
import { deriveBrandAssets } from '../core/derivatives.js';
import { listBrandAssetReceipts, formatPublishReceipt } from '../core/receipts.js';
import { getDerivativePreset, listDerivativePresets } from '../presets/index.js';
import { normalizePromotionSpec, parseDeriveFlag } from '../core/plan.js';
import { MemoryStorageAdapter } from '../adapters/memory.js';
import { FilesystemStorageAdapter } from '../adapters/filesystem.js';
import { CloudflareImagesDeliveryAdapter } from '../adapters/cloudflare-images.js';
import { BrandAssetError } from '../core/errors.js';

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

export function parseBrandCliArgs(argv = []) {
  const out = {
    json: false,
    cwd: process.cwd(),
    dryRun: false,
    yes: false,
    force: false,
    interactive: null,
    brand: '',
    asset: '',
    version: 'v1',
    source: '',
    mark: '',
    icns: '',
    png: '',
    webp: '',
    avif: '',
    manifest: '',
    storageBinding: '',
    bucket: '',
    images: false,
    preset: '',
    derive: [],
    positionals: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--cwd') out.cwd = argv[++i] || out.cwd;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--force') out.force = true;
    else if (a === '--interactive' || a === '-i') out.interactive = true;
    else if (a === '--no-interactive') out.interactive = false;
    else if (a === '--brand') out.brand = argv[++i] || '';
    else if (a === '--asset') out.asset = argv[++i] || '';
    else if (a === '--version') out.version = argv[++i] || 'v1';
    else if (a === '--source') out.source = argv[++i] || '';
    else if (a === '--mark' || a === '--svg') out.mark = argv[++i] || '';
    else if (a === '--icns') out.icns = argv[++i] || '';
    else if (a === '--png' || a === '--icon') out.png = argv[++i] || '';
    else if (a === '--webp') out.webp = argv[++i] || '';
    else if (a === '--avif') out.avif = argv[++i] || '';
    else if (a === '--manifest') out.manifest = argv[++i] || '';
    else if (a === '--storage-binding') out.storageBinding = argv[++i] || '';
    else if (a === '--bucket') out.bucket = argv[++i] || '';
    else if (a === '--images' || a === '--cloudflare-images') out.images = true;
    else if (a === '--preset') out.preset = argv[++i] || '';
    else if (a === '--derive') out.derive.push(argv[++i] || '');
    else out.positionals.push(a);
  }
  return out;
}

function buildSpecFromArgs(opts) {
  if (opts.manifest) return loadJson(opts.manifest);
  const derivatives = [...opts.derive.map(parseDeriveFlag)];
  if (opts.preset) {
    const preset = getDerivativePreset(opts.preset);
    if (!preset) throw new BrandAssetError('unknown_preset', `Unknown preset: ${opts.preset}`);
    derivatives.push(...preset.derivatives);
  }
  const destinations = {};
  if (opts.storageBinding || opts.bucket) {
    destinations.storage = {
      provider: 'cloudflare-r2',
      binding: opts.storageBinding || null,
      bucket: opts.bucket || null,
    };
  }
  if (opts.images) {
    destinations.delivery = { provider: 'cloudflare-images' };
  }
  return normalizePromotionSpec({
    brand: opts.brand,
    asset: opts.asset,
    version: opts.version,
    source: opts.source,
    mark: opts.mark,
    icns: opts.icns,
    png: opts.png,
    webp: opts.webp,
    avif: opts.avif,
    derivatives,
    destinations: Object.keys(destinations).length ? destinations : undefined,
    storageBinding: opts.storageBinding || undefined,
    bucket: opts.bucket || undefined,
    delivery: opts.images ? { provider: 'cloudflare-images' } : undefined,
  });
}

function writeResult(write, opts, value) {
  if (opts.json) write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === 'string') write(`${value}\n`);
  else if (value?.publish || value?.capability === 'brand.publish') {
    write(`${formatPublishReceipt(value.publish || value)}\n`);
  } else {
    write(`${JSON.stringify(value, null, 2)}\n`);
  }
}

/**
 * Shared CLI controller for `agentsam brand` and `agentsam-brand`.
 */
export async function runBrandAssetCommand(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const opts = parseBrandCliArgs(argv);
  const [action = 'help', ...rest] = opts.positionals;

  if (action === 'help' || action === '--help' || action === '-h') {
    write(`usage: brand-assets <inspect|derive|plan|promote|publish|verify|assets|presets> [options]

  inspect <path>              Inspect one local asset
  derive <path>               Generate derivatives (requires --derive or --preset)
  plan [--manifest FILE]      Plan promotion (offline OK)
  promote [--manifest FILE]   Plan (+ derive) and write receipt; --yes to publish
  publish --brand --asset     Publish from receipt via storage adapter
  verify  --brand --asset     Verify storage against receipt
  assets                      List local receipts
  presets                     List derivative presets (data, not product identity)

Scripted:
  brand-assets plan --brand acme --asset app-icon --version v1 \\
    --source ./master.png --derive png:1024 --derive webp:1024:q92 --json

  brand-assets promote --manifest ./brand-assets.json --dry-run --json

Interactive promote when TTY and required flags missing (no product defaults).
`);
    return 0;
  }

  try {
    if (action === 'presets') {
      writeResult(write, opts, { presets: listDerivativePresets() });
      return 0;
    }

    if (action === 'assets') {
      writeResult(write, opts, {
        capability: 'brand.assets',
        receipts: listBrandAssetReceipts(opts.cwd),
      });
      return 0;
    }

    if (action === 'inspect') {
      const file = rest[0] || opts.source;
      if (!file) {
        write('inspect requires a path\n');
        return 2;
      }
      writeResult(write, opts, inspectBrandAsset(file));
      return 0;
    }

    if (action === 'derive') {
      const file = rest[0] || opts.source;
      if (!file) {
        write('derive requires a source path\n');
        return 2;
      }
      const derivatives = opts.derive.length
        ? opts.derive.map(parseDeriveFlag)
        : (getDerivativePreset(opts.preset || 'app-icon')?.derivatives || []);
      const outDir = path.join(opts.cwd, '.agentsam', 'brand', 'work', 'derive');
      const result = deriveBrandAssets({
        sourcePath: file,
        outDir,
        derivatives,
        asset: opts.asset || 'asset',
      });
      writeResult(write, opts, result);
      return 0;
    }

    if (action === 'plan' || action === 'promote') {
      const wantsInteractive =
        opts.interactive === true
        || (opts.interactive !== false
          && !opts.manifest
          && !opts.source
          && !opts.brand
          && process.stdin.isTTY
          && process.stdout.isTTY
          && typeof options.runWizard === 'function');

      if (wantsInteractive) {
        const wizard = await options.runWizard({ cwd: opts.cwd, prompts: options.prompts });
        if (wizard?.cancelled) {
          writeResult(write, opts, wizard);
          return 1;
        }
        const result = await promoteBrandAssets(wizard.spec, {
          cwd: opts.cwd,
          dryRun: wizard.planOnly || opts.dryRun,
          yes: !wizard.planOnly && (opts.yes || wizard.publish),
          publish: !wizard.planOnly && (opts.yes || wizard.publish),
          storageAdapter: wizard.storageAdapter,
          deliveryAdapter: wizard.deliveryAdapter,
          derive: true,
        });
        writeResult(write, opts, { ...result, inventory: wizard.inventory });
        return 0;
      }

      if (!opts.manifest && (!opts.brand || !opts.asset || !opts.source)) {
        write('Missing --brand, --asset, and --source (or --manifest). Use a TTY for interactive mode.\n');
        return 2;
      }

      const spec = buildSpecFromArgs(opts);
      if (action === 'plan') {
        const plan = await planBrandAssetPromotion(spec, {
          deliveryAdapter: opts.images ? new CloudflareImagesDeliveryAdapter() : null,
        });
        writeResult(write, opts, plan);
        return 0;
      }

      const result = await promoteBrandAssets(spec, {
        cwd: opts.cwd,
        dryRun: opts.dryRun,
        yes: opts.yes,
        publish: opts.yes,
        derive: true,
        storageAdapter: opts.bucket || opts.storageBinding
          ? undefined
          : new MemoryStorageAdapter(),
        deliveryAdapter: opts.images ? new CloudflareImagesDeliveryAdapter() : null,
        force: opts.force,
      });
      writeResult(write, opts, result);
      return 0;
    }

    if (action === 'publish') {
      if (!opts.brand || !opts.asset) {
        write('publish requires --brand and --asset\n');
        return 2;
      }
      const storage = opts.bucket
        ? new FilesystemStorageAdapter({ rootDir: path.join(opts.cwd, '.agentsam', 'brand-store', opts.bucket) })
        : new FilesystemStorageAdapter({ rootDir: path.join(opts.cwd, '.agentsam', 'brand-store') });
      const result = await publishBrandAssets({
        cwd: opts.cwd,
        brand: opts.brand,
        asset: opts.asset,
        version: opts.version,
        dryRun: opts.dryRun,
        force: opts.force,
        storageAdapter: storage,
        // Only attach Images adapter when explicitly requested
        deliveryAdapter: opts.images ? new CloudflareImagesDeliveryAdapter() : null,
      });
      writeResult(write, opts, result);
      return 0;
    }

    if (action === 'verify') {
      if (!opts.brand || !opts.asset) {
        write('verify requires --brand and --asset\n');
        return 2;
      }
      const storage = new FilesystemStorageAdapter({
        rootDir: path.join(opts.cwd, '.agentsam', 'brand-store', opts.bucket || ''),
      });
      const result = await verifyBrandAssets({
        cwd: opts.cwd,
        brand: opts.brand,
        asset: opts.asset,
        version: opts.version,
        storageAdapter: storage,
      });
      writeResult(write, opts, result);
      return result.ok ? 0 : 1;
    }

    write(`unknown action: ${action}\n`);
    return 2;
  } catch (err) {
    const payload = {
      ok: false,
      error: err?.code || 'brand_command_failed',
      message: err?.message || String(err),
      details: err?.details || null,
    };
    writeResult(write, { json: true }, payload);
    return 1;
  }
}
