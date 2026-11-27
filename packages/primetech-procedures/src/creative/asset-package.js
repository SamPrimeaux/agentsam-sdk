import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { ensureProjectDirectory, readProjectFile, safeSlug, sha256, writeJsonAtomic } from './paths.js';

const CONTENT_TYPES = new Map([
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.pdf', 'application/pdf'], ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'], ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'], ['.json', 'application/json'],
  ['.html', 'text/html'], ['.css', 'text/css'], ['.md', 'text/markdown'], ['.txt', 'text/plain'],
]);

export async function packageCreativeAssets({ projectRoot, name, files, outputDir = '.agentsam/primetech/deliverables', metadata = {}, includeReadme = true } = {}) {
  const packageName = safeSlug(name, 'package_name');
  if (!Array.isArray(files) || !files.length || files.length > 500) throw new Error('creative_package_files_invalid');
  const entries = {};
  const records = [];
  const seen = new Set();
  for (const item of files) {
    if (!item || typeof item.path !== 'string') throw new Error('creative_package_file_path_required');
    const row = await readProjectFile(projectRoot, item.path, 100 * 1024 * 1024);
    const relative = item.archivePath || item.path.replaceAll('\\', '/');
    if (relative.startsWith('/') || relative.split('/').some(part => part === '..' || part === '.' || !part)) throw new Error('creative_package_archive_path_invalid');
    if (seen.has(relative)) throw new Error(`creative_package_duplicate_archive_path:${relative}`);
    seen.add(relative);
    const ext = path.extname(relative).toLowerCase();
    const record = { path: relative, sourcePath: item.path, role: item.role || 'deliverable', contentType: CONTENT_TYPES.get(ext) || 'application/octet-stream', bytes: row.bytes.length, sha256: sha256(row.bytes) };
    entries[relative] = new Uint8Array(row.bytes);
    records.push(record);
  }
  const manifest = { schema: 'agentsam.creative-delivery.v1', name: packageName, createdAt: new Date().toISOString(), metadata, files: records, totalBytes: records.reduce((sum, item) => sum + item.bytes, 0) };
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
  if (includeReadme) entries['README.md'] = new TextEncoder().encode(`# ${packageName}\n\nThis delivery contains ${records.length} verified source and export files.\n\nSee \`manifest.json\` for file roles, MIME types, sizes, and SHA-256 checksums. Original source files are listed separately from generated derivatives.\n`);
  const zip = zipSync(entries, { level: 8 });
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const packagePath = path.join(root, `${packageName}.zip`);
  const manifestPath = path.join(root, `${packageName}.manifest.json`);
  await fs.writeFile(packagePath, zip, { mode: 0o600 });
  await writeJsonAtomic(manifestPath, manifest);
  return { ok: true, packageName, fileCount: records.length, totalBytes: manifest.totalBytes, packagePath: path.relative(projectRoot, packagePath), packageBytes: zip.length, packageSha256: sha256(zip), manifestPath: path.relative(projectRoot, manifestPath), files: records };
}
