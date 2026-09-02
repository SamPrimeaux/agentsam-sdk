import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { directoryHash, fileHasher, linkHash, comparePaths } from './hash.js';
import { normalizePolicy, isIgnored, validPath } from './policy.js';

const unchanged = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every((key) => a[key] === b[key]);

async function hashFile(filename, before, signal) {
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !unchanged(before, opened)) throw new Error(`File changed while scanning: ${filename}`);
    const hash = fileHasher();
    for await (const chunk of handle.createReadStream({ autoClose: false, signal })) hash.update(chunk);
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(filename, { bigint: true });
    if (!unchanged(opened, after) || !unchanged(after, current)) throw new Error(`File changed while scanning: ${filename}`);
    if (after.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`File is too large: ${filename}`);
    return { hash: 'sha256:' + hash.digest('hex'), size: Number(after.size) };
  } finally { await handle.close(); }
}

export async function buildMerkleTree(root = '.', options = {}) {
  const policy = normalizePolicy(options.policy || options);
  const rootPath = await fs.realpath(root);
  if (!(await fs.stat(rootPath)).isDirectory()) throw new Error('Merkle root must be a directory.');
  const entries = [];
  const stats = { files: 0, symlinks: 0, directories: 0, bytes: 0 };
  const { signal, onProgress } = options;
  async function namesAt(absolute, relative) {
    const raw = await fs.readdir(absolute, { encoding: 'buffer' });
    return raw.map((name) => {
      const text = name.toString('utf8');
      if (!Buffer.from(text).equals(name) || !validPath(text) || text.includes('/')) {
        throw new Error(`Filename cannot be represented portably under ${absolute}`);
      }
      return text;
    }).filter((name) => !isIgnored(relative ? relative + '/' + name : name, policy)).sort(comparePaths);
  }
  async function walk(relative, depth = 0) {
    signal?.throwIfAborted();
    if (depth > 256) throw new Error('Directory depth exceeds 256.');
    const absolute = path.join(rootPath, ...relative.split('/'));
    const stat = await fs.lstat(absolute, { bigint: true });
    let entry;
    if (stat.isSymbolicLink()) {
      const raw = await fs.readlink(absolute, { encoding: 'buffer' });
      const target = raw.toString('utf8');
      if (!Buffer.from(target).equals(raw)) throw new Error(`Symlink target is not UTF-8: ${relative}`);
      if (!unchanged(stat, await fs.lstat(absolute, { bigint: true }))) throw new Error(`Symlink changed while scanning: ${relative}`);
      entry = { path: relative, type: 'symlink', hash: linkHash(target), target };
      stats.symlinks++;
    } else if (stat.isFile()) {
      entry = { path: relative, type: 'file', ...await hashFile(absolute, stat, signal) };
      stats.files++; stats.bytes += entry.size;
    } else if (stat.isDirectory()) {
      const names = await namesAt(absolute, relative);
      const children = [];
      for (const name of names) {
        const child = await walk(relative ? relative + '/' + name : name, depth + 1);
        if (child) children.push({ name, ...child });
      }
      const after = await fs.lstat(absolute, { bigint: true });
      if (stat.ino !== after.ino || stat.dev !== after.dev || !after.isDirectory() ||
          JSON.stringify(names) !== JSON.stringify(await namesAt(absolute, relative))) {
        throw new Error(`Directory changed while scanning: ${absolute}`);
      }
      // Empty directories have no file content identity, including snapshot-only parents.
      if (relative && children.length === 0) return null;
      entry = { path: relative, type: 'directory', hash: directoryHash(children) };
      stats.directories++;
    } else throw new Error(`Unsupported filesystem entry: ${relative} (only files, directories, and symlinks are supported)`);
    entries.push(entry);
    onProgress?.({ ...stats, path: relative });
    return entry;
  }
  const rootEntry = await walk('');
  return { format: 'agentsam-merkle', version: 1, algorithm: 'sha256', rootPath,
    createdAt: new Date().toISOString(), policy, rootHash: rootEntry.hash, stats,
    entries: entries.sort((a, b) => comparePaths(a.path, b.path)) };
}
