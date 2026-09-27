/**
 * Brand pack — materialize slug-keyed folder + zip + gallery.html
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { BrandAssetError, assert } from './errors.js';
import { brandAssetPrefix } from './keys.js';
import { FORMAT_CAPABILITIES, formatCapabilities } from './capabilities.js';
import { deriveBrandAssets } from './derivatives.js';
import { getDerivativePreset } from '../presets/index.js';
import { inspectBrandAsset } from './inspect.js';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

/** Minimal ZIP (store + deflate) writer — no new dependencies. */
export function writeZipArchive(entries, outPath) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = String(entry.name).replace(/\\/g, '/').replace(/^\/+/, '');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '');
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const useStore = compressed.length >= data.length;
    const payload = useStore ? data : compressed;
    const method = useStore ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    parts.push(local, nameBuf, payload);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([...parts, centralBuf, end]));
  return outPath;
}

export function buildGalleryHtml({ brand, asset, version, items = [] } = {}) {
  const cards = items.map((it) => {
    const rel = String(it.rel || it.path || '').replace(/\\/g, '/');
    const label = it.label || path.basename(rel);
    const isSvg = /\.svg$/i.test(rel);
    const media = isSvg
      ? `<object type="image/svg+xml" data="./${rel}" aria-label="${label}"></object>`
      : `<img src="./${rel}" alt="${label}" loading="lazy" />`;
    return `<figure class="card"><div class="frame">${media}</div><figcaption>${label}<br/><small>${it.dims || ''} ${it.bytes_label || ''}</small></figcaption></figure>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand} / ${asset} / ${version} — brand pack</title>
  <style>
    :root { color-scheme: dark; --bg:#0a0a0c; --fg:#e8e6e3; --muted:#8a8580; --line:#2a2a32; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--fg); padding:32px; }
    h1 { font-size:1.4rem; font-weight:560; margin:0 0 8px; }
    p { color:var(--muted); margin:0 0 24px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; }
    .card { margin:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#121216; }
    .frame { aspect-ratio:1; display:grid; place-items:center; padding:12px; background:
      linear-gradient(45deg,#1a1a20 25%,transparent 25%),
      linear-gradient(-45deg,#1a1a20 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#1a1a20 75%),
      linear-gradient(-45deg,transparent 75%,#1a1a20 75%);
      background-size:16px 16px; background-position:0 0,0 8px,8px -8px,-8px 0; }
    .frame img, .frame object { max-width:100%; max-height:100%; }
    figcaption { padding:10px 12px; font-size:0.78rem; border-top:1px solid var(--line); color:var(--muted); }
    small { opacity:0.8; }
  </style>
</head>
<body>
  <h1>${brand} · ${asset} · ${version}</h1>
  <p>Brand pack preview — ${items.length} asset(s). Open this file or serve the pack folder.</p>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`;
}

function formatBytesLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`;
}

/**
 * Build a brand pack directory (and optional zip).
 */
export async function buildBrandPack({
  brand,
  asset,
  version = 'v1',
  sourcePath,
  markPath = null,
  preset = 'app-icon',
  derivatives = null,
  outDir,
  zipPath = null,
  altText = '',
  title = '',
  description = '',
  cwd = process.cwd(),
} = {}) {
  assert(brand && asset, 'identity_required', 'brand and asset are required');
  assert(sourcePath || markPath, 'source_required', 'sourcePath or markPath required');

  const prefix = brandAssetPrefix({ brand, asset, version });
  const root = path.resolve(outDir || path.join(cwd, '.agentsam', 'brand', 'packs', brand, asset, version));
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });

  const sourceDir = path.join(root, 'source');
  const rasterDir = path.join(root, 'raster');
  const vectorDir = path.join(root, 'vector');
  const platformDir = path.join(root, 'platform');
  for (const d of [sourceDir, rasterDir, vectorDir, platformDir]) fs.mkdirSync(d, { recursive: true });

  const galleryItems = [];
  let deriveResult = { artifacts: [] };

  if (sourcePath && fs.existsSync(sourcePath)) {
    const ext = path.extname(sourcePath) || '.png';
    const dest = path.join(sourceDir, `${asset}-master${ext}`);
    fs.copyFileSync(sourcePath, dest);
    const insp = inspectBrandAsset(dest, { role: 'source' });
    galleryItems.push({
      rel: path.relative(root, dest),
      label: `source · ${path.basename(dest)}`,
      dims: insp.width ? `${insp.width}×${insp.height}` : '',
      bytes_label: formatBytesLabel(insp.bytes),
    });

    const derivs = derivatives
      || getDerivativePreset(preset)?.derivatives
      || getDerivativePreset('app-icon')?.derivatives
      || [];

    const workDerive = path.join(root, '.derive-work');
    deriveResult = await deriveBrandAssets({
      sourcePath: dest,
      outDir: workDerive,
      derivatives: derivs,
      asset,
    });

    for (const art of deriveResult.artifacts || []) {
      if (art.status !== 'generated' || !art.path) continue;
      const folder = art.format === 'ico' || art.format === 'icns'
        ? platformDir
        : (art.format === 'webp' || art.format === 'avif' ? path.join(root, 'web') : rasterDir);
      fs.mkdirSync(folder, { recursive: true });
      const leaf = path.basename(art.path);
      const destArt = path.join(folder, leaf);
      fs.copyFileSync(art.path, destArt);
      galleryItems.push({
        rel: path.relative(root, destArt),
        label: `${art.id || leaf}`,
        dims: art.width ? `${art.width}×${art.height}` : '',
        bytes_label: formatBytesLabel(art.bytes),
      });
    }
    fs.rmSync(workDerive, { recursive: true, force: true });
  }

  if (markPath && fs.existsSync(markPath)) {
    const dest = path.join(vectorDir, `${asset}-mark.svg`);
    fs.copyFileSync(markPath, dest);
    galleryItems.push({
      rel: path.relative(root, dest),
      label: 'vector · mark',
      dims: '',
      bytes_label: formatBytesLabel(fs.statSync(dest).size),
    });
  }

  const manifest = {
    schema: 'agentsam.brand-pack.v1',
    brand: String(brand).toLowerCase(),
    asset: String(asset).toLowerCase(),
    version: String(version).toLowerCase(),
    prefix,
    preset: preset || null,
    seo: {
      alt_text: altText || null,
      title: title || null,
      description: description || null,
    },
    format_capabilities: FORMAT_CAPABILITIES,
    artifacts: galleryItems.map((g) => ({
      path: g.rel,
      label: g.label,
      capabilities: formatCapabilities(path.extname(g.rel).slice(1)),
    })),
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const galleryHtml = buildGalleryHtml({
    brand: manifest.brand,
    asset: manifest.asset,
    version: manifest.version,
    items: galleryItems,
  });
  fs.writeFileSync(path.join(root, 'gallery.html'), galleryHtml);

  let zip = null;
  if (zipPath) {
    const absZip = path.resolve(zipPath);
    const entries = [];
    const walk = (dir, base = '') => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = path.join(base, name).replace(/\\/g, '/');
        if (fs.statSync(full).isDirectory()) walk(full, rel);
        else entries.push({ name: `${prefix}/${rel}`, data: fs.readFileSync(full) });
      }
    };
    walk(root);
    // Prefer system zip when available for better tooling; fall back to pure JS
    const tmpListDir = root;
    const zipCmd = spawnSync('zip', ['-r', '-q', absZip, '.'], { cwd: tmpListDir, encoding: 'utf8' });
    if (zipCmd.status === 0 && fs.existsSync(absZip)) {
      zip = absZip;
    } else {
      writeZipArchive(entries, absZip);
      zip = absZip;
    }
  }

  return {
    ok: true,
    capability: 'brand.pack',
    root,
    zip,
    prefix,
    manifest,
    gallery: path.join(root, 'gallery.html'),
    item_count: galleryItems.length,
    derive: deriveResult,
  };
}
