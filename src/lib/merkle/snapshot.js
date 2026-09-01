import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { directoryHash, linkHash, comparePaths } from './hash.js';
import { validPath, normalizePolicy, isIgnored } from './policy.js';
import { buildMerkleTree } from './tree.js';

export function validateSnapshot(value) {
  const fail = (message) => { throw new Error(`Invalid Merkle snapshot: ${message}`); };
  if (!value || value.format !== 'agentsam-merkle' || value.version !== 1 || value.algorithm !== 'sha256') fail('unsupported format/version');
  if (typeof value.rootPath !== 'string' || !value.rootPath || value.rootPath.includes('\0')) fail('missing root path');
  if (!value.policy || !Array.isArray(value.entries) || value.entries.length === 0) fail('missing entries/policy');
  const policy = normalizePolicy(value.policy);
  const nodes = new Map();
  const children = new Map();
  const stats = { files: 0, symlinks: 0, directories: 0, bytes: 0 };
  for (const entry of value.entries) {
    if (!entry || !validPath(entry.path, true) || entry.path.split('/').length > 257 || nodes.has(entry.path)) fail('invalid/duplicate path');
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.hash)) fail('invalid hash');
    if (entry.path && isIgnored(entry.path, policy)) fail('entry contradicts ignore policy');
    if (entry.type === 'file') {
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail('invalid file size');
      stats.files++; stats.bytes += entry.size;
    } else if (entry.type === 'symlink') {
      if (typeof entry.target !== 'string' || entry.hash !== linkHash(entry.target)) fail('invalid symlink');
      stats.symlinks++;
    } else if (entry.type === 'directory') stats.directories++;
    else fail('invalid entry type');
    nodes.set(entry.path, entry);
    if (entry.path) {
      const parent = path.posix.dirname(entry.path) === '.' ? '' : path.posix.dirname(entry.path);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push({ name: path.posix.basename(entry.path), ...entry });
    }
  }
  if (nodes.get('')?.type !== 'directory') fail('missing root directory');
  for (const [parent] of children) if (nodes.get(parent)?.type !== 'directory') fail('missing/non-directory parent');
  for (const entry of nodes.values()) {
    if (entry.type === 'directory') {
      const list = children.get(entry.path) || [];
      if (entry.path && !list.length) fail('empty directories are not recorded');
      if (entry.hash !== directoryHash(list)) fail(`directory hash mismatch: ${JSON.stringify(entry.path)}`);
    }
  }
  if (value.rootHash !== nodes.get('').hash) fail('root hash mismatch');
  return { format: value.format, version: 1, algorithm: 'sha256', rootPath: value.rootPath,
    createdAt: value.createdAt, policy, rootHash: value.rootHash, stats,
    entries: [...nodes.values()].sort((a, b) => comparePaths(a.path, b.path)) };
}

export async function readSnapshot(filename) {
  const stat = await fs.stat(filename);
  if (stat.size > 128 * 1024 * 1024) throw new Error('Snapshot exceeds the 128 MiB limit.');
  return validateSnapshot(JSON.parse(await fs.readFile(filename, 'utf8')));
}

export async function saveSnapshot(root, { out, force = false, ...options } = {}) {
  const rootPath = await fs.realpath(root);
  if (!(await fs.stat(rootPath)).isDirectory()) throw new Error('Merkle root must be a directory.');
  let output = path.resolve(out || path.join(rootPath, '.agentsam/merkle.json'));
  await fs.mkdir(path.dirname(output), { recursive: true });
  output = path.join(await fs.realpath(path.dirname(output)), path.basename(output));
  const existing = await fs.lstat(output).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
  if (existing && (!force || !existing.isFile())) throw new Error('Snapshot output exists; use --force to replace a regular file.');
  const policy = normalizePolicy(options.policy || options);
  const relative = path.relative(rootPath, output).split(path.sep).join('/');
  if (validPath(relative) && !relative.startsWith('../') && !isIgnored(relative, policy)) {
    policy.exclude = [...new Set([...policy.exclude, relative])].sort(comparePaths);
  }
  const snapshot = await buildMerkleTree(rootPath, { ...options, policy });
  const temp = output + '.tmp-' + randomBytes(8).toString('hex');
  try {
    await fs.writeFile(temp, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (force) await fs.rename(temp, output);
    else await fs.link(temp, output); // Atomic no-clobber publication.
  } finally { await fs.unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
  return { snapshot, output };
}
