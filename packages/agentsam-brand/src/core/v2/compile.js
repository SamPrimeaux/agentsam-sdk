/**
 * Compile brand.pack.json → dist representations (ZIP is an export, not SoT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { assert } from '../errors.js';
import { deriveBrandAssets } from '../derivatives.js';
import { writeZipArchive } from '../pack.js';
import { FORMAT_CAPABILITIES, FORMAT_FAMILIES } from '../capabilities.js';
import {
  planSemanticDerivatives,
  materializedToSharpDerivatives,
  defaultLogoUsage,
} from './derivatives-semantic.js';
import {
  normalizeBrandPack,
  touchProvenance,
  BRAND_PACK_FILENAME,
} from './schema.js';
import { applyBrandTemplate } from './templates.js';
import { loadBrandPack, saveBrandPack } from './ingest-graph.js';

function tokensToCss(tokens = {}) {
  const lines = [':root {'];
  for (const [k, v] of Object.entries(tokens.color || {})) {
    const val = typeof v === 'object' ? v.value : v;
    const name = k.startsWith('--') ? k : `--${k.replace(/[^a-z0-9-]/gi, '-')}`;
    lines.push(`  ${name}: ${val};`);
  }
  for (const [k, v] of Object.entries(tokens.type || {})) {
    if (v?.family) lines.push(`  --font-${k.replace(/[^a-z0-9-]/gi, '-')}: ${v.family};`);
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function tokensToJson(tokens = {}) {
  return `${JSON.stringify({ $schema: 'https://agentsam.inneranimalmedia.com/schemas/brand-tokens/v1.json', ...tokens }, null, 2)}\n`;
}

function buildStudioHtml(pack) {
  const brand = pack.brand?.name || pack.brand?.id || 'Brand';
  const assets = (pack.assets || []).map((a) => `
    <tr>
      <td>${a.role}</td>
      <td>${a.label || a.id}</td>
      <td>${a.master?.format || '—'}</td>
      <td>${a.provenance?.confidence != null ? Number(a.provenance.confidence).toFixed(2) : '—'}</td>
      <td>${a.licensing?.status || '—'}</td>
    </tr>`).join('');
  const colors = Object.entries(pack.tokens?.color || {}).slice(0, 24).map(([k, v]) => {
    const val = typeof v === 'object' ? v.value : v;
    return `<div class="swatch"><i style="background:${val}"></i><span>${k}<br/><small>${val}</small></span></div>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand} — Brand Studio</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0b0e; --fg:#eceae6; --muted:#8b8680; --line:#2a2a32; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--fg); }
    header { padding:28px 32px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; }
    h1 { margin:0; font-size:1.35rem; font-weight:560; }
    nav { display:flex; gap:12px; padding:12px 32px; border-bottom:1px solid var(--line); color:var(--muted); font-size:0.85rem; }
    main { padding:28px 32px; display:grid; gap:28px; }
    section h2 { font-size:0.95rem; margin:0 0 12px; letter-spacing:0.04em; text-transform:uppercase; color:var(--muted); }
    table { width:100%; border-collapse:collapse; font-size:0.88rem; }
    th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
    .swatches { display:flex; flex-wrap:wrap; gap:10px; }
    .swatch { display:flex; gap:8px; align-items:center; min-width:140px; }
    .swatch i { width:28px; height:28px; border-radius:6px; border:1px solid var(--line); display:block; }
    .note { color:var(--muted); font-size:0.85rem; }
    code { font-size:0.8rem; }
  </style>
</head>
<body>
  <header>
    <h1>${brand}</h1>
    <span class="note">brand.pack.json · compiled studio</span>
  </header>
  <nav>
    <span>Overview</span><span>Logo</span><span>Color</span><span>Type</span>
    <span>Imagery</span><span>Motion</span><span>3D</span><span>Tokens</span><span>Delivery</span>
  </nav>
  <main>
    <section>
      <h2>Assets (${pack.assets?.length || 0})</h2>
      <table>
        <thead><tr><th>Role</th><th>Label</th><th>Master</th><th>Confidence</th><th>License</th></tr></thead>
        <tbody>${assets || '<tr><td colspan="5">No assets</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Color tokens</h2>
      <div class="swatches">${colors || '<p class="note">No color tokens yet — ingest HTML/CSS or declare tokens.</p>'}</div>
    </section>
    <section>
      <h2>Delivery policy</h2>
      <p class="note">Images → <code>${pack.delivery?.images}</code> · Video → <code>${pack.delivery?.video}</code> · Objects → <code>${pack.delivery?.objects}</code></p>
      <p class="note">Policy: <code>${pack.delivery?.policy || 'role_canonical'}</code> (per-role masters; CF negotiates AVIF/WebP)</p>
    </section>
    <section>
      <h2>Source of truth</h2>
      <p class="note">This page is a <strong>compiled representation</strong>. Edit <code>brand.pack.json</code>, then re-run <code>agentsam brand build</code>.</p>
    </section>
  </main>
</body>
</html>
`;
}

/**
 * Build compiled dist from brand.pack.json
 */
export async function buildBrandPackFromGraph(options = {}) {
  const cwd = options.cwd || process.cwd();
  let pack = options.pack;
  if (!pack && options.from) {
    pack = await loadBrandPack(options.from, { cwd });
  }
  assert(pack, 'pack_required', 'brand.pack.json / pack object required');
  pack = normalizeBrandPack(pack);

  if (options.template) {
    pack = applyBrandTemplate(pack, options.template);
  }

  const brandId = pack.brand.id || 'untitled';
  const distRoot = path.resolve(
    options.outDir || path.join(cwd, '.agentsam', 'brand', 'dist', brandId),
  );
  fs.rmSync(distRoot, { recursive: true, force: true });

  const dirs = {
    root: distRoot,
    web: path.join(distRoot, 'web'),
    social: path.join(distRoot, 'social'),
    icons: path.join(distRoot, 'icons'),
    app: path.join(distRoot, 'app'),
    media: path.join(distRoot, 'media'),
    models: path.join(distRoot, 'models'),
    tokens: path.join(distRoot, 'brand-tokens'),
    assets: path.join(distRoot, 'assets'),
  };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

  // Persist SoT at dist root
  saveBrandPack(pack, distRoot);

  // Tokens compile
  fs.writeFileSync(path.join(dirs.tokens, 'tokens.json'), tokensToJson(pack.tokens));
  fs.writeFileSync(path.join(dirs.tokens, 'tokens.css'), tokensToCss(pack.tokens));

  const plans = [];
  const materialized = [];
  const warnings = [...(pack.validation?.warnings || [])];

  for (const asset of pack.assets || []) {
    const plan = planSemanticDerivatives(asset.role, { materializeAll: options.materializeAll });
    asset.derivatives = plan;
    if (asset.family === 'logo' || String(asset.role).startsWith('logo.')) {
      asset.usage = asset.usage || defaultLogoUsage(asset.role);
      const usageDir = path.join(dirs.assets, 'logo', asset.role.replace(/^logo\./, '') || 'primary');
      fs.mkdirSync(usageDir, { recursive: true });
      fs.writeFileSync(path.join(usageDir, 'usage.json'), `${JSON.stringify(asset.usage, null, 2)}\n`);
    }

    // Copy master when present
    const masterPath = asset.master?.path;
    if (masterPath && fs.existsSync(masterPath)) {
      const familyDir = path.join(dirs.assets, asset.family || 'generic', asset.id);
      fs.mkdirSync(familyDir, { recursive: true });
      const dest = path.join(familyDir, path.basename(masterPath));
      fs.copyFileSync(masterPath, dest);
      asset.master = { ...asset.master, compiled: path.relative(distRoot, dest) };

      // Materialize sharp derivatives for raster masters only
      const sharpRows = materializedToSharpDerivatives(plan);
      if (sharpRows.length && /\.(png|jpe?g|webp|gif|tiff?)$/i.test(masterPath)) {
        const outDerive = path.join(familyDir, 'derived');
        const result = await deriveBrandAssets({
          sourcePath: masterPath,
          outDir: outDerive,
          derivatives: sharpRows,
          asset: asset.id,
        });
        for (const art of result.artifacts || []) {
          if (art.status === 'generated') {
            materialized.push({
              asset_id: asset.id,
              role: asset.role,
              ...art,
              relative: path.relative(distRoot, art.path),
            });
          }
        }
      }

      // Fonts: never copy into redistributable zip unless licensed
      if (asset.family === 'font' && asset.licensing?.redistributable !== true) {
        warnings.push({
          code: 'font_not_redistributable',
          asset_id: asset.id,
          message: `${asset.label || asset.id} excluded from redistributable export until licensing.redistributable=true`,
        });
      }
    }

    plans.push({ asset_id: asset.id, role: asset.role, plan });
  }

  // Studio HTML (interactive guidelines scaffold)
  fs.writeFileSync(path.join(distRoot, 'studio.html'), buildStudioHtml(pack));
  fs.writeFileSync(path.join(distRoot, 'gallery.html'), buildStudioHtml(pack));

  // Delivery manifest (compiled)
  const deliveryManifest = {
    schema: 'agentsam.brand-delivery.v1',
    brand: pack.brand,
    delivery: pack.delivery,
    format_capabilities: FORMAT_CAPABILITIES,
    format_families: FORMAT_FAMILIES,
    assets: (pack.assets || []).map((a) => ({
      id: a.id,
      role: a.role,
      master: a.master?.compiled || a.master?.relative || null,
      canonical_policy: a.derivatives?.canonical_policy || null,
      redistributable: a.licensing ? a.licensing.redistributable === true : true,
    })),
    materialized_count: materialized.length,
  };
  fs.writeFileSync(path.join(distRoot, 'delivery.manifest.json'), `${JSON.stringify(deliveryManifest, null, 2)}\n`);

  pack.validation = { warnings, errors: pack.validation?.errors || [] };
  pack = touchProvenance(pack, { op: 'build', dist: distRoot, materialized: materialized.length });
  saveBrandPack(pack, distRoot);

  let zip = null;
  if (options.zip !== false) {
    const zipPath = path.resolve(
      options.zipPath || path.join(cwd, '.agentsam', 'brand', 'packs', `${brandId}-brand.zip`),
    );
    const entries = [];
    const walk = (dir, base = '') => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = path.join(base, name).replace(/\\/g, '/');
        if (fs.statSync(full).isDirectory()) walk(full, rel);
        else {
          // Skip non-redistributable fonts from zip
          if (/\.(otf|ttf|woff2?)$/i.test(name)) {
            const asset = pack.assets.find((a) => a.master?.compiled?.endsWith(name) || a.master?.path?.endsWith(name));
            if (asset?.licensing && asset.licensing.redistributable !== true) continue;
          }
          entries.push({ name: `${brandId}/${rel}`, data: fs.readFileSync(full) });
        }
      }
    };
    walk(distRoot);
    writeZipArchive(entries, zipPath);
    zip = zipPath;
  }

  return {
    ok: true,
    capability: 'brand.build',
    source_of_truth: path.join(distRoot, BRAND_PACK_FILENAME),
    dist: distRoot,
    zip,
    studio: path.join(distRoot, 'studio.html'),
    plans,
    materialized,
    warnings,
    pack,
  };
}
