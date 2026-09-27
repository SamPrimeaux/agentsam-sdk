import fs from 'node:fs';
import path from 'node:path';
import { planBrandAssetPromotion } from '../core/plan.js';
import { promoteBrandAssets, publishBrandAssets, verifyBrandAssets } from '../core/promote.js';
import { inspectBrandAsset } from '../core/inspect.js';
import { deriveBrandAssets } from '../core/derivatives.js';
import { listBrandAssetReceipts, formatPublishReceipt } from '../core/receipts.js';
import { getDerivativePreset, listDerivativePresets } from '../presets/index.js';
import { normalizePromotionSpec, parseDeriveFlag } from '../core/plan.js';
import { resolveSourceInput } from '../core/ingest.js';
import { buildBrandPack } from '../core/pack.js';
import { previewBrandPack } from '../core/preview.js';
import { ingestBrandSources, loadBrandPack } from '../core/v2/ingest-graph.js';
import { buildBrandPackFromGraph } from '../core/v2/compile.js';
import { listBrandTemplates, createPackFromTemplate } from '../core/v2/templates.js';
import { listAssetRoles } from '../core/v2/roles.js';
import { MemoryStorageAdapter } from '../adapters/memory.js';
import { FilesystemStorageAdapter } from '../adapters/filesystem.js';
import { CloudflareImagesDeliveryAdapter } from '../adapters/cloudflare-images.js';
import { BrandAssetError } from '../core/errors.js';
import { optimizeBrandAsset } from '../core/optimize.js';
import { discoverProcessors } from '../core/processors/index.js';

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
    out: '',
    from: '',
    dropDir: '',
    watch: false,
    noOpen: false,
    alt: '',
    title: '',
    description: '',
    template: '',
    noZip: false,
    role: '',
    target: 'web',
    processor: '',
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
    else if (a === '--out' || a === '-o') out.out = argv[++i] || '';
    else if (a === '--from') out.from = argv[++i] || '';
    else if (a === '--drop-dir') out.dropDir = argv[++i] || '';
    else if (a === '--watch') out.watch = true;
    else if (a === '--no-open') out.noOpen = true;
    else if (a === '--alt') out.alt = argv[++i] || '';
    else if (a === '--title') out.title = argv[++i] || '';
    else if (a === '--description') out.description = argv[++i] || '';
    else if (a === '--template') out.template = argv[++i] || '';
    else if (a === '--no-zip') out.noZip = true;
    else if (a === '--role') out.role = argv[++i] || '';
    else if (a === '--target') out.target = argv[++i] || 'web';
    else if (a === '--processor') out.processor = argv[++i] || '';
    else out.positionals.push(a);
  }
  return out;
}

async function resolveSourceForSpec(opts) {
  if (!opts.source && !opts.dropDir) return opts;
  const ingested = await resolveSourceInput({
    source: opts.source,
    dropDir: opts.dropDir,
    watch: opts.watch,
    workDir: path.join(opts.cwd, '.agentsam', 'brand', 'work', 'stdin'),
    cwd: opts.cwd,
  });
  if (!ingested) return opts;
  return {
    ...opts,
    source: ingested.path,
    mark: opts.mark || ingested.markPath || '',
  };
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
    seo: {
      alt_text: opts.alt || null,
      title: opts.title || null,
      description: opts.description || null,
    },
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
    write(`usage: brand-assets <inspect|derive|optimize|processors|ingest|build|pack|preview|plan|promote|publish|verify|assets|presets|templates|roles> [options]

Brand compiler (v2 — brand.pack.json is source of truth):
  ingest <path|zip|tar|folder>   Classify assets → brand.pack.json
  build --from <pack>            Compile dist + studio + optional zip export
  preview --from <dist|zip>      Localhost gallery / studio
  optimize <file>                Role-aware encode (processor adapter — not Squoosh CLI)
  processors                     List sharp / squoosh-binary / native / cloudflare
  templates                      List uniform brand templates
  roles                          List asset roles

Examples:
  agentsam brand optimize ./hero.png --role hero.landscape --target web
  agentsam brand optimize ./logo.png --role logo.primary --processor sharp
  agentsam brand ingest ./exports --brand acme --template product-saas
  agentsam brand build --from .agentsam/brand/packs/acme --out ./dist/acme
`);
    return 0;
  }

  try {
    if (action === 'presets') {
      writeResult(write, opts, { presets: listDerivativePresets() });
      return 0;
    }

    if (action === 'templates') {
      writeResult(write, opts, { templates: listBrandTemplates() });
      return 0;
    }

    if (action === 'roles') {
      writeResult(write, opts, { roles: listAssetRoles() });
      return 0;
    }

    if (action === 'processors') {
      writeResult(write, opts, discoverProcessors());
      return 0;
    }

    if (action === 'optimize') {
      let file = rest[0] || opts.source;
      if (file === '-' || opts.source === '-' || opts.dropDir) {
        const resolved = await resolveSourceForSpec({ ...opts, source: file === '-' ? '-' : opts.source });
        file = resolved.source;
      }
      if (!file) {
        write('optimize requires a source path (or --source - / --drop-dir)\n');
        return 2;
      }
      const result = await optimizeBrandAsset({
        sourcePath: path.resolve(opts.cwd, file),
        role: opts.role || opts.asset || 'asset.generic',
        target: opts.target || 'web',
        brandId: opts.brand || '',
        outDir: opts.out || path.join(opts.cwd, '.agentsam', 'brand', 'work', 'optimize'),
        processor: opts.processor || undefined,
        dryRun: opts.dryRun,
        semantic: {
          subject: opts.title ? [opts.title] : [],
        },
      });
      writeResult(write, opts, result);
      return result.ok ? 0 : 1;
    }

    if (action === 'ingest') {
      const input = rest[0] || opts.source || opts.dropDir;
      if (!input) {
        write('ingest requires a path, archive, or folder\n');
        return 2;
      }
      let pack = null;
      if (opts.template && opts.brand) {
        pack = createPackFromTemplate(opts.template, { brandId: opts.brand });
      }
      const result = await ingestBrandSources(input, {
        cwd: opts.cwd,
        brandId: opts.brand || undefined,
        brandName: opts.title || undefined,
        pack,
        template: opts.template || undefined,
      });
      if (opts.template) {
        const { applyBrandTemplate } = await import('../core/v2/templates.js');
        result.pack = applyBrandTemplate(result.pack, opts.template);
        const { saveBrandPack } = await import('../core/v2/ingest-graph.js');
        saveBrandPack(result.pack, path.dirname(result.pack_path));
      }
      writeResult(write, opts, result);
      return 0;
    }

    if (action === 'build') {
      const from = opts.from || rest[0];
      if (!from && !opts.brand) {
        write('build requires --from <brand.pack.json|dir> (or ingest first)\n');
        return 2;
      }
      const result = await buildBrandPackFromGraph({
        from: from || path.join(opts.cwd, '.agentsam', 'brand', 'packs', opts.brand),
        cwd: opts.cwd,
        outDir: opts.out || undefined,
        template: opts.template || undefined,
        zip: !opts.noZip,
        zipPath: opts.out && String(opts.out).endsWith('.zip') ? opts.out : undefined,
      });
      writeResult(write, opts, result);
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
      let file = rest[0] || opts.source;
      if (file === '-' || opts.source === '-' || opts.dropDir) {
        const resolved = await resolveSourceForSpec({ ...opts, source: file === '-' ? '-' : opts.source });
        file = resolved.source;
      }
      if (!file) {
        write('derive requires a source path (or --source - / --drop-dir)\n');
        return 2;
      }
      const derivatives = opts.derive.length
        ? opts.derive.map(parseDeriveFlag)
        : (getDerivativePreset(opts.preset || 'app-icon')?.derivatives || []);
      const outDir = path.join(opts.cwd, '.agentsam', 'brand', 'work', 'derive');
      const result = await deriveBrandAssets({
        sourcePath: file,
        outDir,
        derivatives,
        asset: opts.asset || 'asset',
      });
      writeResult(write, opts, result);
      return 0;
    }

    if (action === 'pack') {
      const resolved = await resolveSourceForSpec(opts);
      if (!resolved.brand || !resolved.asset || (!resolved.source && !resolved.mark)) {
        write('pack requires --brand, --asset, and --source (path, -, or --drop-dir)\n');
        return 2;
      }
      const zipPath = resolved.out
        || path.join(
          resolved.cwd,
          '.agentsam',
          'brand',
          'packs',
          `${resolved.brand}-${resolved.asset}-${resolved.version}.zip`,
        );
      const result = await buildBrandPack({
        brand: resolved.brand,
        asset: resolved.asset,
        version: resolved.version,
        sourcePath: resolved.source,
        markPath: resolved.mark || null,
        preset: resolved.preset || 'app-icon',
        zipPath,
        altText: resolved.alt,
        title: resolved.title,
        description: resolved.description,
        cwd: resolved.cwd,
      });
      writeResult(write, opts, result);
      return 0;
    }

    if (action === 'preview') {
      const from = opts.from || rest[0];
      if (!from) {
        write('preview requires --from <pack-dir|zip>\n');
        return 2;
      }
      const result = await previewBrandPack({
        from,
        cwd: opts.cwd,
        open: !opts.noOpen,
        waitForEnter: !opts.json && process.stdin.isTTY,
        write,
      });
      if (opts.json) writeResult(write, opts, result);
      return 0;
    }

    if (action === 'plan' || action === 'promote') {
      const wantsInteractive =
        opts.interactive === true
        || (opts.interactive !== false
          && !opts.manifest
          && !opts.source
          && !opts.dropDir
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
        writeResult(write, opts, { ...result, inventory: wizard.inventory, pack: wizard.pack || null });
        return 0;
      }

      const resolved = await resolveSourceForSpec(opts);
      if (!resolved.manifest && (!resolved.brand || !resolved.asset || !resolved.source)) {
        write('Missing --brand, --asset, and --source (or --manifest / --drop-dir). Use a TTY for interactive mode.\n');
        return 2;
      }

      const spec = buildSpecFromArgs(resolved);
      if (action === 'plan') {
        const plan = await planBrandAssetPromotion(spec, {
          deliveryAdapter: resolved.images ? new CloudflareImagesDeliveryAdapter() : null,
        });
        writeResult(write, opts, plan);
        return 0;
      }

      const result = await promoteBrandAssets(spec, {
        cwd: resolved.cwd,
        dryRun: resolved.dryRun,
        yes: resolved.yes,
        publish: resolved.yes,
        derive: true,
        storageAdapter: resolved.bucket || resolved.storageBinding
          ? undefined
          : new MemoryStorageAdapter(),
        deliveryAdapter: resolved.images ? new CloudflareImagesDeliveryAdapter() : null,
        force: resolved.force,
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
