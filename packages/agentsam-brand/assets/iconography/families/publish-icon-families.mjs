import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const repo = process.cwd();
const distRoot = path.join(repo, 'packages/agentsam-brand/dist/iconography');
const sourceRoot = path.join(repo, 'packages/agentsam-brand/assets/iconography/families');
const stagingRoot = path.join(distRoot, 'r2-staging');
const seedRoot = path.join(distRoot, 'registry-seed');
const accountId = process.env.AGENTSAM_ACCOUNT_ID;
if (!accountId) throw new Error('AGENTSAM_ACCOUNT_ID_required_for_registry_seed');
const customDomain = 'https://brand.inneranimalmedia.com';
const bucket = 'brand';

const families = [
  {
    slug: 'primetech',
    familyKey: 'icon-families',
    familyId: 'primetech-shared-brand-icon-families',
    name: 'PrimeTech Shared Brand Icon Families',
    buildDir: path.join(distRoot, 'primetech/v1'),
    sourceDir: path.join(sourceRoot, 'primetech/v1'),
    archive: path.join(distRoot, 'primetech-icon-family-v1.zip'),
    preview: path.join(distRoot, 'primetech-icon-family-preview.png'),
    libraryPath: '/PrimeTech/Brand References/PrimeTech',
    includeSourceFiles: ['p-prime-electric-original.svg', 'p-prime-spectrum-squircle-original.svg'],
    packageName: 'primetech-icon-family-v1.zip',
  },
  {
    slug: 'inneranimal',
    familyKey: 'cloud-system-icons',
    familyId: 'inneranimal-cloud-system-icons',
    name: 'InnerAnimal Cloud System Icons',
    buildDir: path.join(distRoot, 'inneranimal-cloud/v1'),
    sourceDir: path.join(sourceRoot, 'inneranimal-cloud/v1'),
    archive: path.join(distRoot, 'inneranimal-cloud-icons-v1.zip'),
    preview: null,
    libraryPath: '/PrimeTech/Brand References/Cloud Icon Exports',
    includeSourceFiles: [
      'custom-cloud-download-si-source.svg',
      'custom-cloud-download-si-favicon.svg',
      'custom-cloud-download-si-mono-black.svg',
      'custom-cloud-download-si-mono-white.svg',
      'custom-cloud-code-si-source.svg',
      'custom-cloud-code-si-favicon.svg',
      'custom-cloud-code-si-mono-black.svg',
      'custom-cloud-code-si-mono-white.svg',
    ],
    packageName: 'inneranimal-cloud-icons-v1.zip',
  },
];

const mimeFor = (file) => {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.json': 'application/json', '.zip': 'application/zip',
    '.md': 'text/markdown', '.mjs': 'text/javascript',
  })[ext] || 'application/octet-stream';
};
const cleanId = (value) => String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
const copyMapped = async (source, key, map) => {
  const destination = path.join(stagingRoot, key);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  const stat = await fs.stat(destination);
  map.push({ source_path: destination, key, content_type: mimeFor(destination), bytes: stat.size });
  return { key, bytes: stat.size };
};
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const addVariant = (variants, assetId, assetKey, slug, variantKey, fileFormat, key, dimensions = {}) => {
  return variants.push({
    id: `bvar_${cleanId(slug)}_${cleanId(assetKey)}_${cleanId(variantKey)}_${cleanId(fileFormat)}`,
    asset_id: assetId,
    variant_key: variantKey,
    file_format: fileFormat,
    width: dimensions.width ?? null,
    height: dimensions.height ?? null,
    file_size_bytes: dimensions.bytes ?? null,
    storage_provider: 'r2',
    storage_location: key,
    delivery_url: null,
    custom_domain_url: `${customDomain}/${key}`,
    is_primary: variantKey === 'vector' ? 1 : 0,
  });
};

await fs.rm(stagingRoot, { recursive: true, force: true });
await fs.rm(seedRoot, { recursive: true, force: true });
await fs.mkdir(stagingRoot, { recursive: true });
await fs.mkdir(seedRoot, { recursive: true });

const uploadMap = [];
const brandAssets = [];
const variants = [];
const relationships = [];
const catalog = { schema: 'agentsam.brand-icon-family-index.v1', families: [] };

for (const family of families) {
  const build = await readJson(path.join(family.buildDir, 'manifest.json'));
  const iconCount = Array.isArray(build.icons) ? build.icons.length : Number(build.icon_count || 0);
  const familyPrefix = `brands/${family.slug}/${family.familyKey}/v1`;
  const familyAssetId = `basset_${cleanId(family.slug)}_${cleanId(family.familyKey)}_v1`;
  const familyPackageKey = `${familyPrefix}/${family.packageName}`;
  const familyManifestKey = `${familyPrefix}/manifest.json`;
  const sourceManifestKey = `${familyPrefix}/family.manifest.json`;

  const manifestCopy = await copyMapped(path.join(family.buildDir, 'manifest.json'), familyManifestKey, uploadMap);
  const sourceManifestCopy = await copyMapped(path.join(family.sourceDir, 'family.manifest.json'), sourceManifestKey, uploadMap);
  const packageCopy = await copyMapped(family.archive, familyPackageKey, uploadMap);
  const readmePath = path.join(family.sourceDir, 'README.md');
  await copyMapped(readmePath, `${familyPrefix}/README.md`, uploadMap);

  if (family.preview) {
    const previewKey = `${familyPrefix}/preview/icon-family-preview.png`;
    await copyMapped(family.preview, previewKey, uploadMap);
    const previewMeta = await sharp(family.preview).metadata();
    const previewStat = await fs.stat(family.preview);
    addVariant(variants, familyAssetId, family.familyKey, family.slug, 'preview', 'png', previewKey, {
      width: previewMeta.width, height: previewMeta.height, bytes: previewStat.size,
    });
  }

  const sourceDir = path.join(family.sourceDir, 'source');
  for (const name of family.includeSourceFiles) {
    const source = path.join(sourceDir, name);
    await copyMapped(source, `${familyPrefix}/source/${name}`, uploadMap);
  }
  if (family.slug === 'primetech') {
    const generator = path.join(family.sourceDir, 'generate-sources.mjs');
    await copyMapped(generator, `${familyPrefix}/source/generate-sources.mjs`, uploadMap);
  }

  brandAssets.push({
    id: familyAssetId,
    account_id: accountId,
    brand_slug: family.slug,
    asset_key: family.familyKey,
    version: 'v1',
    category: 'other',
    title: family.name,
    alt_text: `${family.name} asset catalog and export package.`,
    description: `${iconCount} original icon assets with editable SVG masters and standardized platform exports.`,
    meta_json: JSON.stringify({
      family_id: family.familyId,
      brand_slug: family.slug,
      r2_bucket: bucket,
      r2_prefix: familyPrefix,
      manifest_key: familyManifestKey,
      source_manifest_key: sourceManifestKey,
      package_key: familyPackageKey,
      preview_key: family.preview ? `${familyPrefix}/preview/icon-family-preview.png` : null,
      icon_count: iconCount,
      size_sets: build.size_sets,
      reference_library_path: family.libraryPath,
    }),
  });

  addVariant(variants, familyAssetId, family.familyKey, family.slug, 'manifest', 'json', familyManifestKey, { bytes: manifestCopy.bytes });
  addVariant(variants, familyAssetId, family.familyKey, family.slug, 'source-manifest', 'json', sourceManifestKey, { bytes: sourceManifestCopy.bytes });
  addVariant(variants, familyAssetId, family.familyKey, family.slug, 'package', 'zip', familyPackageKey, { bytes: packageCopy.bytes });

  const iconCatalog = [];
  for (const icon of build.icons) {
    const assetKey = family.slug === 'primetech' ? `icon-${icon.id}` : icon.id;
    const assetId = `basset_${cleanId(family.slug)}_${cleanId(assetKey)}_v1`;
    const prefix = `brands/${family.slug}/${assetKey}/v1`;
    const meta = {
      family_id: family.familyId,
      family_asset_id: familyAssetId,
      semantic: icon.semantic,
      colorway: icon.metadata?.colorway || null,
      colorway_name: icon.metadata?.colorway_name || null,
      shape: icon.metadata?.shape || null,
      shape_name: icon.metadata?.shape_name || null,
      background: icon.metadata?.background || null,
      approved_geometry: icon.metadata?.approved_geometry || null,
      reference: icon.metadata?.reference || null,
      favicon_sizes: [16, 24, 32, 48, 64, 128, 256],
      app_sizes: [128, 180, 192, 256, 512, 1024, 1200],
      menu_sizes: [16, 20, 24, 32],
      standard_sizes: [48, 64],
      webp_sizes: [64, 128, 192, 512],
      r2_prefix: prefix,
      reference_library_path: family.libraryPath,
    };
    brandAssets.push({
      id: assetId,
      account_id: accountId,
      brand_slug: family.slug,
      asset_key: assetKey,
      version: 'v1',
      category: 'icon',
      title: icon.name,
      alt_text: icon.description || icon.name,
      description: icon.description || icon.name,
      meta_json: JSON.stringify(meta),
    });
    relationships.push({
      id: `rel_${cleanId(family.slug)}_${cleanId(assetKey)}_family_member`,
      source_type: 'brand_asset',
      source_id: familyAssetId,
      target_type: 'brand_asset',
      target_id: assetId,
      relationship_type: 'family_member',
      metadata: JSON.stringify({ family_id: family.familyId, brand_slug: family.slug, ...(icon.metadata || {}) }),
    });

    const fileByPath = new Map(build.files.filter((file) => file.icon_id === icon.id).map((file) => [file.path, file]));
    const iconFiles = build.files.filter((file) => file.icon_id === icon.id);
    for (const file of iconFiles) {
      const isSource = file.path.startsWith(`sources/${icon.id}/`);
      const isExport = file.path.startsWith(`exports/${icon.id}/`);
      if (!isSource && !isExport) throw new Error(`unexpected_family_file_path:${file.path}`);
      const relative = isSource
        ? file.path.slice(`sources/${icon.id}/`.length)
        : file.path.slice(`exports/${icon.id}/`.length);
      const key = isSource
        ? `${prefix}/source/${relative}`
        : `${prefix}/${relative}`;
      const source = path.join(family.buildDir, file.path);
      await copyMapped(source, key, uploadMap);
    }

    const addFrom = (variantKey, filePath, fileFormat, width = null, height = null, primary = false) => {
      const record = fileByPath.get(filePath);
      if (!record) throw new Error(`missing_variant_file:${icon.id}:${filePath}`);
      const isSource = filePath.startsWith(`sources/${icon.id}/`);
      const relative = isSource ? filePath.slice(`sources/${icon.id}/`.length) : filePath.slice(`exports/${icon.id}/`.length);
      const key = isSource ? `${prefix}/source/${relative}` : `${prefix}/${relative}`;
      variants.push({
        id: `bvar_${cleanId(family.slug)}_${cleanId(assetKey)}_${cleanId(variantKey)}_${cleanId(fileFormat)}`,
        asset_id: assetId,
        variant_key: variantKey,
        file_format: fileFormat,
        width: width ?? record.width ?? null,
        height: height ?? record.height ?? null,
        file_size_bytes: record.bytes,
        storage_provider: 'r2',
        storage_location: key,
        delivery_url: null,
        custom_domain_url: `${customDomain}/${key}`,
        is_primary: primary ? 1 : 0,
      });
    };

    addFrom('vector', `sources/${icon.id}/master.svg`, 'svg', null, null, true);
    addFrom('favicon-svg', `exports/${icon.id}/favicon/favicon.svg`, 'svg');
    addFrom('favicon-32', `exports/${icon.id}/favicon/32.png`, 'png', 32, 32);
    addFrom('favicon-ico', `exports/${icon.id}/favicon/favicon.ico`, 'ico', 256, 256);
    addFrom('apple-touch-180', `exports/${icon.id}/app/apple-touch-icon.png`, 'png', 180, 180);
    addFrom('pwa-512', `exports/${icon.id}/app/pwa-512.png`, 'png', 512, 512);

    iconCatalog.push({ id: icon.id, asset_key: assetKey, asset_id: assetId, name: icon.name, semantic: icon.semantic, metadata: icon.metadata || {}, r2_prefix: prefix });
  }

  catalog.families.push({
    family_id: family.familyId,
    brand_slug: family.slug,
    asset_key: family.familyKey,
    asset_id: familyAssetId,
    name: family.name,
    manifest_key: familyManifestKey,
    package_key: familyPackageKey,
    reference_library_path: family.libraryPath,
    icons: iconCatalog,
  });
}

const catalogPath = path.join(sourceRoot, 'index.json');
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await copyMapped(catalogPath, 'brands/iconography/families/index.json', uploadMap);

// Split D1 variant seed into compact batches so each approval-gated write remains small.
const variantBatches = [];
for (let i = 0; i < variants.length; i += 55) variantBatches.push(variants.slice(i, i + 55));
await fs.writeFile(path.join(seedRoot, 'brand-assets.json'), `${JSON.stringify(brandAssets)}\n`);
await fs.writeFile(path.join(seedRoot, 'relationships.json'), `${JSON.stringify(relationships)}\n`);
for (let i = 0; i < variantBatches.length; i += 1) {
  await fs.writeFile(path.join(seedRoot, `variants-${String(i + 1).padStart(2, '0')}.json`), `${JSON.stringify(variantBatches[i])}\n`);
}
await fs.writeFile(path.join(seedRoot, 'summary.json'), `${JSON.stringify({
  brand_asset_count: brandAssets.length,
  brand_asset_variant_count: variants.length,
  relationship_count: relationships.length,
  upload_object_count: uploadMap.length,
  upload_bytes: uploadMap.reduce((sum, entry) => sum + entry.bytes, 0),
  variant_batches: variantBatches.length,
  families: catalog.families.map((family) => ({ family_id: family.family_id, brand_slug: family.brand_slug, icon_count: family.icons.length })),
}, null, 2)}\n`);
await fs.writeFile(path.join(distRoot, 'upload-map.json'), `${JSON.stringify(uploadMap, null, 2)}\n`);

if (process.argv.includes('--upload')) {
  const concurrency = Number(process.env.UPLOAD_CONCURRENCY || 6);
  let next = 0;
  let completed = 0;
  const failures = [];
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= uploadMap.length) return;
      const item = uploadMap[index];
      const args = [
        'r2', 'object', 'put', `${bucket}/${item.key}`,
        '--file', item.source_path,
        '--content-type', item.content_type,
        '--cache-control', 'public, max-age=31536000, immutable',
        '--remote', '--force',
      ];
      await new Promise((resolve) => {
        const child = spawn('wrangler', args, { cwd: repo, stdio: 'ignore', env: { ...process.env, CI: '1', NO_COLOR: '1' } });
        child.on('error', (error) => { failures.push({ key: item.key, error: String(error) }); resolve(); });
        child.on('close', (code) => {
          if (code !== 0) failures.push({ key: item.key, exit_code: code });
          completed += 1;
          if (completed % 50 === 0 || completed === uploadMap.length) console.log(`uploaded ${completed}/${uploadMap.length}`);
          resolve();
        });
      });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const report = { uploaded: uploadMap.length - failures.length, failed: failures.length, failures };
  await fs.writeFile(path.join(distRoot, 'upload-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

console.log(JSON.stringify({
  staging_root: stagingRoot,
  upload_objects: uploadMap.length,
  upload_bytes: uploadMap.reduce((sum, entry) => sum + entry.bytes, 0),
  brand_assets: brandAssets.length,
  brand_asset_variants: variants.length,
  relationships: relationships.length,
  variant_batches: variantBatches.length,
  seed_root: seedRoot,
  catalog: catalogPath,
}, null, 2));
