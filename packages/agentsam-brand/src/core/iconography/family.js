import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

export const ICON_FAMILY_SCHEMA = 'agentsam.brand-icon-family.v1';
export const ICON_FAMILY_BUILDER = 'agentsam-brand.iconography-family/1.0.0';

const DEFAULT_SIZE_SETS = Object.freeze({
  menu: [16, 18, 20, 24, 32],
  standard: [48, 64],
  app: [128, 180, 192, 256, 512],
  favicon: [16, 32, 48],
  webp: [48, 64, 128, 180, 192, 256, 512],
});
const REQUIRED_VARIANTS = ['master', 'micro', 'monochrome_light', 'monochrome_dark'];
const OWNER_MARKER = 'agentsam-brand.iconography-family';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
let sharpPromise;
async function loadSharp() {
  sharpPromise ||= import('sharp').then((module) => module.default || module);
  return sharpPromise;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeSegment(value, label) {
  const text = String(value || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) {
    throw new Error(`iconography_${label}_invalid`);
  }
  return text;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveSourcePath(root, relativePath, label) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error(`iconography_${label}_path_invalid`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!isWithin(root, resolved)) throw new Error(`iconography_${label}_path_outside_family`);
  return resolved;
}

function normalizeSizeSets(value = {}) {
  const sets = {};
  for (const [name, fallback] of Object.entries(DEFAULT_SIZE_SETS)) {
    const sizes = value[name] === undefined ? fallback : value[name];
    if (!Array.isArray(sizes) || !sizes.length) throw new Error(`iconography_size_set_invalid:${name}`);
    const unique = [...new Set(sizes)];
    if (unique.some((size) => !Number.isInteger(size) || size < 8 || size > 2048)) {
      throw new Error(`iconography_size_invalid:${name}`);
    }
    sets[name] = unique.sort((a, b) => a - b);
  }
  return sets;
}

function validateSvgMarkup(svg, label) {
  if (typeof svg !== 'string' || !/<svg\b/i.test(svg) || !/viewBox\s*=\s*["'][^"']+["']/i.test(svg)) {
    throw new Error(`iconography_svg_root_invalid:${label}`);
  }
  if (Buffer.byteLength(svg, 'utf8') > MAX_SOURCE_BYTES) throw new Error(`iconography_svg_too_large:${label}`);
  const forbidden = [
    /<\s*script\b/i,
    /<\s*foreignObject\b/i,
    /<\s*image\b/i,
    /<\s*iframe\b/i,
    /<\s*text\b/i,
    /\son[a-z]+\s*=/i,
    /(?:href|xlink:href)\s*=\s*["']\s*(?!#)/i,
    /url\(\s*["']?\s*(?:https?:|data:|file:)/i,
  ];
  if (forbidden.some((pattern) => pattern.test(svg))) throw new Error(`iconography_svg_unsafe:${label}`);
  if (!/\bid\s*=\s*["'][a-zA-Z][\w:.-]*["']/.test(svg)) {
    throw new Error(`iconography_svg_layers_missing:${label}`);
  }
  const viewBox = svg.match(/viewBox\s*=\s*["']\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i);
  if (!viewBox || Math.abs(Number(viewBox[3]) - Number(viewBox[4])) > 0.01) {
    throw new Error(`iconography_svg_viewbox_not_square:${label}`);
  }
  return { viewBox: viewBox.slice(1).map(Number) };
}

async function readFamilyManifest(manifestPath) {
  const absolute = path.resolve(manifestPath);
  const root = await fs.realpath(path.dirname(absolute));
  const realManifestPath = await fs.realpath(absolute);
  if (!isWithin(root, realManifestPath)) throw new Error('iconography_manifest_path_outside_family');
  const raw = await fs.readFile(realManifestPath);
  const manifest = JSON.parse(raw.toString('utf8'));
  if (manifest.schema !== ICON_FAMILY_SCHEMA) throw new Error('iconography_family_schema_unsupported');
  return { manifest, manifestPath: realManifestPath, root, raw, sourceManifestSha256: sha256(raw) };
}

export async function validateIconographyFamilyManifest({ manifestPath }) {
  if (!manifestPath) throw new Error('iconography_manifest_required');
  const loaded = await readFamilyManifest(manifestPath);
  const { manifest, root } = loaded;
  const familyId = safeSegment(manifest.family_id, 'family_id');
  const revision = safeSegment(manifest.revision, 'revision');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('iconography_family_name_required');
  if (manifest.metadata !== undefined && (!manifest.metadata || typeof manifest.metadata !== 'object' || Array.isArray(manifest.metadata))) {
    throw new Error('iconography_family_metadata_invalid');
  }
  if (manifest.source_policy?.original_only !== true || manifest.source_policy?.allow_external_icon_libraries !== false) {
    throw new Error('iconography_original_source_policy_required');
  }
  if (manifest.source_policy?.allow_third_party_marks !== false) throw new Error('iconography_third_party_marks_must_be_disabled');
  const sizeSets = normalizeSizeSets(manifest.size_sets || {});
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 1) throw new Error('iconography_icons_required');
  const seen = new Set();
  const sourceFiles = [];
  const sharp = await loadSharp();
  for (const icon of manifest.icons) {
    const id = safeSegment(icon.id, 'icon_id');
    if (seen.has(id)) throw new Error(`iconography_icon_id_duplicate:${id}`);
    seen.add(id);
    if (typeof icon.name !== 'string' || !icon.name.trim()) throw new Error(`iconography_icon_name_required:${id}`);
    if (typeof icon.semantic !== 'string' || !icon.semantic.trim()) throw new Error(`iconography_icon_semantic_required:${id}`);
    if (icon.metadata !== undefined && (!icon.metadata || typeof icon.metadata !== 'object' || Array.isArray(icon.metadata))) {
      throw new Error(`iconography_icon_metadata_invalid:${id}`);
    }
    if (!icon.variants || typeof icon.variants !== 'object') throw new Error(`iconography_icon_variants_required:${id}`);
    for (const variant of REQUIRED_VARIANTS) {
      const sourcePath = resolveSourcePath(root, icon.variants[variant], `${id}_${variant}`);
      const realSourcePath = await fs.realpath(sourcePath);
      if (!isWithin(root, realSourcePath)) throw new Error(`iconography_source_symlink_outside_family:${id}:${variant}`);
      const bytes = await fs.readFile(realSourcePath);
      const svg = bytes.toString('utf8');
      const geometry = validateSvgMarkup(svg, `${id}/${variant}`);
      // Sharp is the renderer used for production exports; parse every source now so
      // a syntactically valid but unrenderable SVG never reaches the build stage.
      const metadata = await sharp(bytes, { density: 144 }).metadata();
      if (!metadata.width || !metadata.height) throw new Error(`iconography_svg_not_renderable:${id}:${variant}`);
      sourceFiles.push({
        icon_id: id,
        variant,
        path: path.relative(root, realSourcePath).split(path.sep).join('/'),
        sha256: sha256(bytes),
        bytes: bytes.length,
        view_box: geometry.viewBox,
        width: metadata.width,
        height: metadata.height,
      });
    }
    if (icon.layers !== undefined && (!Array.isArray(icon.layers) || icon.layers.some((layer) => !layer.id || !layer.name))) {
      throw new Error(`iconography_layers_invalid:${id}`);
    }
  }
  return {
    ok: true,
    capability: 'brand.iconography.family.validate',
    schema: ICON_FAMILY_SCHEMA,
    family_id: familyId,
    revision,
    icon_count: manifest.icons.length,
    metadata: manifest.metadata || {},
    size_sets: sizeSets,
    source_manifest_sha256: loaded.sourceManifestSha256,
    source_files: sourceFiles,
  };
}

async function renderPng(svg, size) {
  const sharp = await loadSharp();
  return sharp(Buffer.from(svg), { density: 192 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime();
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = entry.data;
    const method = /\.(?:png|webp|ico|glb|woff2?)$/i.test(entry.name) ? 0 : 8;
    const compressed = method === 0 ? data : deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function icoFromPngFrames(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries = [];
  const payloads = [];
  let offset = 6 + frames.length * 16;
  for (const frame of frames) {
    const size = frame.size;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(frame.png);
    offset += frame.png.length;
  }
  return Buffer.concat([header, ...entries, ...payloads]);
}

async function writeFileRecord(staging, relativePath, bytes, metadata, records) {
  const absolute = path.join(staging, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, bytes);
  records.push({
    path: relativePath.split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    mime_type: metadata.mime_type,
    role: metadata.role,
    icon_id: metadata.icon_id || null,
    variant: metadata.variant || null,
    size: metadata.size || null,
    width: metadata.width || null,
    height: metadata.height || null,
  });
  return absolute;
}

export async function buildIconographyFamilyPack({ manifestPath, outDir }) {
  if (!manifestPath || !outDir) throw new Error('iconography_manifest_and_output_required');
  const validation = await validateIconographyFamilyManifest({ manifestPath });
  const sharp = await loadSharp();
  const loaded = await readFamilyManifest(manifestPath);
  const manifest = loaded.manifest;
  const familyId = validation.family_id;
  const revision = validation.revision;
  const sizeSets = validation.size_sets;
  const destination = path.resolve(outDir);
  if (destination === path.parse(destination).root) throw new Error('iconography_output_path_invalid');
  if (isWithin(loaded.root, destination)) throw new Error('iconography_output_must_be_outside_source_family');
  if (await fs.stat(destination).then(() => true).catch(() => false)) throw new Error('iconography_output_exists');
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  const staging = path.join(parent, `.${path.basename(destination)}.staging-${process.pid}-${Date.now()}`);
  await fs.mkdir(staging, { recursive: false });
  const records = [];
  const builtIcons = [];
  try {
    for (const icon of manifest.icons) {
      const iconId = safeSegment(icon.id, 'icon_id');
      const sourceRecords = {};
      const svgSources = {};
      for (const variant of REQUIRED_VARIANTS) {
        const sourcePath = resolveSourcePath(loaded.root, icon.variants[variant], `${iconId}_${variant}`);
        const bytes = await fs.readFile(sourcePath);
        const relative = `sources/${iconId}/${variant}.svg`;
        await writeFileRecord(staging, relative, bytes, {
          mime_type: 'image/svg+xml', role: 'editable-source', icon_id: iconId, variant,
        }, records);
        sourceRecords[variant] = relative;
        svgSources[variant] = bytes.toString('utf8');
      }
      if (Array.isArray(icon.layers)) {
        const layerBytes = Buffer.from(`${JSON.stringify({ icon_id: iconId, layers: icon.layers }, null, 2)}\n`);
        await writeFileRecord(staging, `sources/${iconId}/layers.json`, layerBytes, {
          mime_type: 'application/json', role: 'editable-layer-map', icon_id: iconId,
        }, records);
      }

      const iconExports = { menu: [], standard: [], app: [], webp: [], favicon: [] };
      for (const size of sizeSets.menu) {
        for (const [variant, folder] of [['micro', 'color'], ['monochrome_light', 'mono-light'], ['monochrome_dark', 'mono-dark']]) {
          const png = await renderPng(svgSources[variant], size);
          const relative = `exports/${iconId}/menu/${folder}/${size}.png`;
          const meta = await sharp(png).metadata();
          await writeFileRecord(staging, relative, png, {
            mime_type: 'image/png', role: 'menu-icon', icon_id: iconId, variant: folder, size, width: meta.width, height: meta.height,
          }, records);
          iconExports.menu.push(relative);
        }
      }
      for (const size of sizeSets.standard) {
        for (const [variant, folder] of [['micro', 'color'], ['monochrome_light', 'mono-light'], ['monochrome_dark', 'mono-dark']]) {
          const png = await renderPng(svgSources[variant], size);
          const relative = `exports/${iconId}/standard/${folder}/${size}.png`;
          const meta = await sharp(png).metadata();
          await writeFileRecord(staging, relative, png, {
            mime_type: 'image/png', role: 'standard-icon', icon_id: iconId, variant: folder, size, width: meta.width, height: meta.height,
          }, records);
          iconExports.standard.push(relative);
        }
      }
      const appFrames = new Map();
      for (const size of sizeSets.app) {
        const png = await renderPng(svgSources.master, size);
        const relative = `exports/${iconId}/app/png/${size}.png`;
        const meta = await sharp(png).metadata();
        await writeFileRecord(staging, relative, png, {
          mime_type: 'image/png', role: 'app-icon', icon_id: iconId, variant: 'master', size, width: meta.width, height: meta.height,
        }, records);
        appFrames.set(size, png);
        iconExports.app.push(relative);
      }
      for (const size of sizeSets.webp) {
        const sharp = await loadSharp();
        const webp = await sharp(Buffer.from(svgSources.master), { density: 192 })
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: 92, effort: 6 })
          .toBuffer();
        const relative = `exports/${iconId}/app/webp/${size}.webp`;
        const meta = await sharp(webp).metadata();
        await writeFileRecord(staging, relative, webp, {
          mime_type: 'image/webp', role: 'app-icon-optimized', icon_id: iconId, variant: 'master', size, width: meta.width, height: meta.height,
        }, records);
        iconExports.webp.push(relative);
      }
      const faviconFrames = [];
      for (const size of sizeSets.favicon) {
        const png = await renderPng(svgSources.micro, size);
        const relative = `exports/${iconId}/favicon/${size}.png`;
        const meta = await sharp(png).metadata();
        await writeFileRecord(staging, relative, png, {
          mime_type: 'image/png', role: 'favicon-frame', icon_id: iconId, variant: 'micro', size, width: meta.width, height: meta.height,
        }, records);
        faviconFrames.push({ size, png });
        iconExports.favicon.push(relative);
      }
      const faviconSvg = Buffer.from(svgSources.micro, 'utf8');
      await writeFileRecord(staging, `exports/${iconId}/favicon/favicon.svg`, faviconSvg, {
        mime_type: 'image/svg+xml', role: 'favicon-vector', icon_id: iconId, variant: 'micro',
      }, records);
      const ico = icoFromPngFrames(faviconFrames);
      await writeFileRecord(staging, `exports/${iconId}/favicon/favicon.ico`, ico, {
        mime_type: 'image/vnd.microsoft.icon', role: 'favicon-multisize', icon_id: iconId,
      }, records);
      const touch = appFrames.get(180);
      if (touch) await writeFileRecord(staging, `exports/${iconId}/app/apple-touch-icon.png`, touch, {
        mime_type: 'image/png', role: 'apple-touch-icon', icon_id: iconId, size: 180, width: 180, height: 180,
      }, records);
      const pwa192 = appFrames.get(192);
      if (pwa192) await writeFileRecord(staging, `exports/${iconId}/app/pwa-192.png`, pwa192, {
        mime_type: 'image/png', role: 'pwa-icon', icon_id: iconId, size: 192, width: 192, height: 192,
      }, records);
      const pwa512 = appFrames.get(512);
      if (pwa512) await writeFileRecord(staging, `exports/${iconId}/app/pwa-512.png`, pwa512, {
        mime_type: 'image/png', role: 'pwa-icon', icon_id: iconId, size: 512, width: 512, height: 512,
      }, records);
      builtIcons.push({
        id: iconId,
        name: icon.name,
        semantic: icon.semantic,
        description: icon.description || '',
        metadata: icon.metadata || {},
        layers: icon.layers || [],
        source_files: sourceRecords,
        exports: iconExports,
      });
    }

    const outputManifest = {
      schema: 'agentsam.brand-icon-family-build.v1',
      builder: ICON_FAMILY_BUILDER,
      family_id: familyId,
      name: manifest.name,
      revision,
      metadata: manifest.metadata || {},
      source_manifest: path.basename(loaded.manifestPath),
      source_manifest_sha256: loaded.sourceManifestSha256,
      source_policy: manifest.source_policy,
      size_sets: sizeSets,
      icons: builtIcons,
      files: records,
      totals: {
        icons: builtIcons.length,
        files: records.length,
        bytes: records.reduce((sum, record) => sum + record.bytes, 0),
      },
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(outputManifest, null, 2)}\n`);
    await fs.writeFile(path.join(staging, 'manifest.json'), manifestBytes);
    await fs.writeFile(path.join(staging, '.agentsam-generated.json'), `${JSON.stringify({
      owner: OWNER_MARKER,
      family_id: familyId,
      revision,
      source_manifest_sha256: loaded.sourceManifestSha256,
      generated_at: new Date().toISOString(),
    }, null, 2)}\n`);
    await fs.rename(staging, destination);
    return {
      ok: true,
      capability: 'brand.iconography.family.build',
      family_id: familyId,
      revision,
      output: destination,
      manifest: path.join(destination, 'manifest.json'),
      icon_count: builtIcons.length,
      file_count: records.length + 2,
      total_bytes: records.reduce((sum, record) => sum + record.bytes, 0) + manifestBytes.length,
      sizes: sizeSets,
      source_manifest_sha256: loaded.sourceManifestSha256,
    };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function inspectIconographyFamilyPack({ buildDir }) {
  if (!buildDir) throw new Error('iconography_build_dir_required');
  const root = await fs.realpath(path.resolve(buildDir));
  const marker = JSON.parse(await fs.readFile(path.join(root, '.agentsam-generated.json'), 'utf8'));
  if (marker.owner !== OWNER_MARKER) throw new Error('iconography_build_owner_mismatch');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'agentsam.brand-icon-family-build.v1' || manifest.family_id !== marker.family_id) {
    throw new Error('iconography_build_manifest_invalid');
  }
  const failures = [];
  for (const record of manifest.files || []) {
    const filePath = path.resolve(root, record.path);
    if (!isWithin(root, filePath)) {
      failures.push({ path: record.path, error: 'path_outside_build' });
      continue;
    }
    const bytes = await fs.readFile(filePath).catch(() => null);
    if (!bytes) {
      failures.push({ path: record.path, error: 'missing' });
      continue;
    }
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) {
      failures.push({ path: record.path, error: 'hash_or_size_mismatch' });
      continue;
    }
    if (record.mime_type === 'image/png' || record.mime_type === 'image/webp') {
      const sharp = await loadSharp();
      const metadata = await sharp(bytes).metadata();
      if (metadata.width !== record.width || metadata.height !== record.height) {
        failures.push({ path: record.path, error: 'dimensions_mismatch' });
      }
    }
  }
  const icoFailures = [];
  for (const icon of manifest.icons || []) {
    const icoPath = path.join(root, 'exports', icon.id, 'favicon', 'favicon.ico');
    const ico = await fs.readFile(icoPath).catch(() => null);
    if (!ico || ico.length < 22 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) < 1) {
      icoFailures.push({ icon_id: icon.id, error: 'favicon_ico_invalid' });
    }
  }
  return {
    ok: failures.length === 0 && icoFailures.length === 0,
    capability: 'brand.iconography.family.inspect',
    family_id: manifest.family_id,
    revision: manifest.revision,
    output: root,
    icon_count: manifest.icons?.length || 0,
    file_count: manifest.files?.length || 0,
    total_bytes: manifest.totals?.bytes || 0,
    failures,
    ico_failures: icoFailures,
  };
}

async function collectPackageFiles(root, relative = '') {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    const absolute = path.join(root, child);
    if (entry.isSymbolicLink()) throw new Error(`iconography_package_symlink_rejected:${child}`);
    if (entry.isDirectory()) files.push(...await collectPackageFiles(root, child));
    else if (entry.isFile()) files.push({ name: child, data: await fs.readFile(absolute) });
  }
  return files;
}

export async function packageIconographyFamilyPack({ buildDir, outFile }) {
  if (!buildDir || !outFile) throw new Error('iconography_package_paths_required');
  const inspection = await inspectIconographyFamilyPack({ buildDir });
  if (!inspection.ok) throw new Error('iconography_package_build_not_verified');
  const root = await fs.realpath(path.resolve(buildDir));
  const destination = path.resolve(outFile);
  if (isWithin(root, destination)) throw new Error('iconography_archive_must_be_outside_build');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const entries = await collectPackageFiles(root);
  const zip = makeZip(entries);
  const temp = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, zip);
  await fs.rename(temp, destination);
  return {
    ok: true,
    capability: 'brand.iconography.family.package',
    family_id: inspection.family_id,
    revision: inspection.revision,
    archive: destination,
    bytes: zip.length,
    sha256: sha256(zip),
    file_count: entries.length,
  };
}
