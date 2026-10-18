import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { evidenceError } from './contract.js';
import { assertSafeKey } from './naming.js';

/**
 * Local filesystem store for evidence. Keys are human-readable slug paths, never account ids.
 * The host chooses the absolute root. Anything an R2 or other adapter must provide is the same
 * small surface: put, get, has, list, and (to serve a run) open.
 */
export function createLocalEvidenceStore({ root } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw evidenceError('evidence_store_root_required');
  const base = path.resolve(root);
  let realBase = null;

  const lexical = (key) => {
    assertSafeKey(key);
    const full = path.resolve(base, ...key.split('/'));
    if (full !== base && !full.startsWith(base + path.sep)) throw evidenceError('evidence_key_invalid');
    return full;
  };

  // Resolve symlinks on the deepest existing ancestor so a link inside the root cannot escape it.
  async function contained(full) {
    if (realBase === null) {
      await mkdir(base, { recursive: true });
      realBase = await realpath(base);
    }
    let probe = full;
    for (;;) {
      try {
        const real = await realpath(probe);
        if (real !== realBase && !real.startsWith(realBase + path.sep)) throw evidenceError('evidence_key_invalid');
        return full;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        const parent = path.dirname(probe);
        if (parent === probe) throw evidenceError('evidence_key_invalid');
        probe = parent;
      }
    }
  }

  return {
    async put(key, body) {
      const full = await contained(lexical(key));
      await mkdir(path.dirname(full), { recursive: true });
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const temporary = `${full}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, full);
      return { key, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    },
    async get(key) {
      const full = await contained(lexical(key));
      try { return await readFile(full); } catch (error) { if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return null; throw error; }
    },
    async has(key) {
      const full = await contained(lexical(key));
      try { return (await stat(full)).isFile(); } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    },
    async list(prefix) {
      const start = await contained(lexical(prefix));
      const found = [];
      const walk = async (directory, relative) => {
        let entries;
        try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
          if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return;
          throw error;
        }
        for (const entry of entries) {
          if (entry.name.endsWith('.tmp')) continue;
          const child = `${relative}/${entry.name}`;
          if (entry.isDirectory()) await walk(path.join(directory, entry.name), child);
          else if (entry.isFile()) found.push(child);
        }
      };
      await walk(start, prefix);
      return found.sort();
    },
    async open(key) {
      const full = await contained(lexical(key));
      try {
        const info = await stat(full);
        if (!info.isFile()) return null;
        return { size: info.size, stream: (range) => createReadStream(full, range) };
      } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
    },
    async localPath(key) { return contained(lexical(key)); },
  };
}
