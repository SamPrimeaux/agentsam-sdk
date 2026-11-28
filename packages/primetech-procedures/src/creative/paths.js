import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function safeSlug(value, label = 'value') {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    const error = new Error(`${label}_invalid`);
    error.code = `${label}_invalid`;
    throw error;
  }
  return slug;
}

export function resolveProjectPath(projectRoot, relativePath) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) throw new Error('absolute_project_root_required');
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) throw new Error('project_relative_path_required');
  const root = path.resolve(projectRoot);
  const candidate = path.resolve(root, relativePath);
  const rel = path.relative(root, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('project_path_outside_root');
  return candidate;
}

export async function readProjectFile(projectRoot, relativePath, maxBytes = 64 * 1024 * 1024) {
  const candidate = resolveProjectPath(projectRoot, relativePath);
  const realRoot = await fs.realpath(projectRoot);
  const realPath = await fs.realpath(candidate);
  const rel = path.relative(realRoot, realPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('project_path_symlink_escape');
  const stat = await fs.stat(realPath);
  if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('project_file_invalid_or_oversized');
  return { path: realPath, bytes: await fs.readFile(realPath), stat };
}

export async function ensureProjectDirectory(projectRoot, relativePath) {
  const candidate = resolveProjectPath(projectRoot, relativePath);
  await fs.mkdir(candidate, { recursive: true, mode: 0o700 });
  const realRoot = await fs.realpath(projectRoot);
  const realPath = await fs.realpath(candidate);
  const rel = path.relative(realRoot, realPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('project_output_path_symlink_escape');
  return realPath;
}

export async function writeFileAtomic(targetPath, bytes, mode = 0o600) {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = `${targetPath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx', mode });
    await fs.rename(temp, targetPath);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function writeJsonAtomic(targetPath, value) {
  await writeFileAtomic(targetPath, `${JSON.stringify(value, null, 2)}\n`, 0o600);
}
