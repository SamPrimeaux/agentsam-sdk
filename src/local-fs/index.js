/**
 * Local machine filesystem operations under an authorized workspace root.
 * Version = sha256 of file bytes (content-addressed optimistic concurrency).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveContainedPath } from './paths.js';

export const LOCAL_FS_ENGINE = 'agentsam-local-fs-v1';
export const MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MiB text default

/**
 * @param {string} root
 */
export function createLocalFilesystem(root) {
  const resolvedRoot = path.resolve(root);

  function contain(rel) {
    return resolveContainedPath(resolvedRoot, rel);
  }

  function hashBytes(buf) {
    return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
  }

  /**
   * @param {string} relPath
   * @param {{ recursive?: boolean, maxDepth?: number }} [opts]
   */
  function list(relPath = '.', opts = {}) {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    const recursive = Boolean(opts.recursive);
    const maxDepth = opts.maxDepth ?? 6;
    /** @type {Array<{ path: string, kind: string, size: number, mtime: number }>} */
    const items = [];
    const skip = new Set(['.git', 'node_modules', '.output', 'dist', '.DS_Store']);

    /**
     * @param {string} abs
     * @param {string} rel
     * @param {number} depth
     */
    function walk(abs, rel, depth) {
      let entries;
      try {
        entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'list_failed',
        };
      }
      for (const e of entries) {
        if (skip.has(e.name) || e.name === '.DS_Store') continue;
        const childRel = rel === '.' ? e.name : `${rel}/${e.name}`;
        const childAbs = path.join(abs, e.name);
        let size = 0;
        let mtime = 0;
        try {
          const st = fs.lstatSync(childAbs);
          size = st.size;
          mtime = Math.floor(st.mtimeMs);
        } catch {
          /* ignore */
        }
        const kind = e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file';
        items.push({ path: childRel, kind, size, mtime });
        if (recursive && kind === 'directory' && depth < maxDepth) {
          const nested = walk(childAbs, childRel, depth + 1);
          if (nested && nested.ok === false) return nested;
        }
      }
      return { ok: true };
    }

    const walked = walk(gate.abs, gate.rel, 0);
    if (walked && walked.ok === false) return walked;

    items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    return { ok: true, root: resolvedRoot, path: gate.rel, entries: items, engine: LOCAL_FS_ENGINE };
  }

  /**
   * @param {string} relPath
   */
  function stat(relPath) {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    try {
      const st = fs.lstatSync(gate.abs);
      const kind = st.isDirectory() ? 'directory' : st.isSymbolicLink() ? 'symlink' : 'file';
      let content_hash = null;
      if (kind === 'file' && st.size <= MAX_TEXT_BYTES) {
        content_hash = hashBytes(fs.readFileSync(gate.abs));
      }
      return {
        ok: true,
        path: gate.rel,
        kind,
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
        content_hash,
        binary: kind === 'file' && st.size > 0 ? null : false,
        engine: LOCAL_FS_ENGINE,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'stat_failed',
      };
    }
  }

  /**
   * @param {string} relPath
   * @param {{ maxBytes?: number }} [opts]
   */
  function read(relPath, opts = {}) {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    const maxBytes = opts.maxBytes ?? MAX_TEXT_BYTES;
    try {
      const st = fs.statSync(gate.abs);
      if (st.isDirectory()) {
        return { ok: false, error: 'is_directory', code: 'is_directory' };
      }
      if (st.size > maxBytes) {
        return {
          ok: false,
          error: `file_too_large:${st.size}>${maxBytes}`,
          code: 'file_too_large',
          size: st.size,
        };
      }
      const buf = fs.readFileSync(gate.abs);
      // Detect obvious binary
      const sample = buf.subarray(0, Math.min(buf.length, 8000));
      if (sample.includes(0)) {
        return {
          ok: false,
          error: 'binary_file',
          code: 'binary_file',
          size: st.size,
          content_hash: hashBytes(buf),
        };
      }
      const content = buf.toString('utf8');
      const version = hashBytes(buf);
      return {
        ok: true,
        path: gate.rel,
        content,
        version,
        content_hash: version,
        mtime: Math.floor(st.mtimeMs),
        size: st.size,
        engine: LOCAL_FS_ENGINE,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'read_failed',
      };
    }
  }

  /**
   * Atomic write with optional optimistic concurrency (expectedVersion).
   * @param {string} relPath
   * @param {string} content
   * @param {{ expectedVersion?: string|null, overwrite?: boolean }} [opts]
   */
  function write(relPath, content, opts = {}) {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    if (typeof content !== 'string') {
      return { ok: false, error: 'content_must_be_string', code: 'invalid_input' };
    }
    const buf = Buffer.from(content, 'utf8');
    if (buf.length > MAX_TEXT_BYTES) {
      return { ok: false, error: 'content_too_large', code: 'file_too_large' };
    }

    const exists = fs.existsSync(gate.abs);
    if (exists) {
      const current = fs.readFileSync(gate.abs);
      const currentVersion = hashBytes(current);
      if (opts.expectedVersion != null && opts.expectedVersion !== '' && opts.expectedVersion !== currentVersion) {
        if (!opts.overwrite) {
          return {
            ok: false,
            error: 'version_conflict',
            code: 'version_conflict',
            expected: opts.expectedVersion,
            actual: currentVersion,
            path: gate.rel,
          };
        }
      }
    } else if (opts.expectedVersion) {
      return {
        ok: false,
        error: 'version_conflict',
        code: 'version_conflict',
        expected: opts.expectedVersion,
        actual: null,
        path: gate.rel,
      };
    }

    try {
      fs.mkdirSync(path.dirname(gate.abs), { recursive: true });
      const tmp = path.join(
        path.dirname(gate.abs),
        `.agentsam-write-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
      );
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, gate.abs);
      const version = hashBytes(buf);
      const st = fs.statSync(gate.abs);
      return {
        ok: true,
        path: gate.rel,
        version,
        content_hash: version,
        mtime: Math.floor(st.mtimeMs),
        size: st.size,
        engine: LOCAL_FS_ENGINE,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'write_failed',
      };
    }
  }

  /**
   * @param {string} relPath
   * @param {string} [content]
   */
  function create(relPath, content = '') {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    if (fs.existsSync(gate.abs)) {
      return { ok: false, error: 'already_exists', code: 'already_exists', path: gate.rel };
    }
    return write(relPath, content, {});
  }

  /**
   * @param {string} fromRel
   * @param {string} toRel
   * @param {{ expectedVersion?: string|null }} [opts]
   */
  function rename(fromRel, toRel, opts = {}) {
    const from = contain(fromRel);
    if (!from.ok) return from;
    const to = contain(toRel);
    if (!to.ok) return to;
    if (!fs.existsSync(from.abs)) {
      return { ok: false, error: 'not_found', code: 'ENOENT', path: from.rel };
    }
    if (opts.expectedVersion) {
      const st = fs.statSync(from.abs);
      if (st.isFile()) {
        const current = hashBytes(fs.readFileSync(from.abs));
        if (current !== opts.expectedVersion) {
          return {
            ok: false,
            error: 'version_conflict',
            code: 'version_conflict',
            expected: opts.expectedVersion,
            actual: current,
          };
        }
      }
    }
    if (fs.existsSync(to.abs)) {
      return { ok: false, error: 'target_exists', code: 'already_exists', path: to.rel };
    }
    try {
      fs.mkdirSync(path.dirname(to.abs), { recursive: true });
      fs.renameSync(from.abs, to.abs);
      return { ok: true, from: from.rel, to: to.rel, engine: LOCAL_FS_ENGINE };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'rename_failed',
      };
    }
  }

  /**
   * @param {string} relPath
   * @param {{ expectedVersion?: string|null, recursive?: boolean }} [opts]
   */
  function remove(relPath, opts = {}) {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    if (!fs.existsSync(gate.abs)) {
      return { ok: false, error: 'not_found', code: 'ENOENT', path: gate.rel };
    }
    const st = fs.lstatSync(gate.abs);
    if (st.isFile() && opts.expectedVersion) {
      const current = hashBytes(fs.readFileSync(gate.abs));
      if (current !== opts.expectedVersion) {
        return {
          ok: false,
          error: 'version_conflict',
          code: 'version_conflict',
          expected: opts.expectedVersion,
          actual: current,
        };
      }
    }
    try {
      if (st.isDirectory()) {
        fs.rmSync(gate.abs, { recursive: Boolean(opts.recursive), force: false });
      } else {
        fs.unlinkSync(gate.abs);
      }
      return { ok: true, path: gate.rel, engine: LOCAL_FS_ENGINE };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'remove_failed',
      };
    }
  }

  /**
   * @param {string} relPath
   */
  function mkdir(relPath) {
    const gate = contain(relPath);
    if (!gate.ok) return gate;
    try {
      fs.mkdirSync(gate.abs, { recursive: true });
      return { ok: true, path: gate.rel, engine: LOCAL_FS_ENGINE };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err && typeof err === 'object' && 'code' in err ? String(err.code) : 'mkdir_failed',
      };
    }
  }

  return {
    root: resolvedRoot,
    engine: LOCAL_FS_ENGINE,
    list,
    stat,
    read,
    write,
    create,
    rename,
    remove,
    mkdir,
  };
}

/**
 * Disposable scratch root under os.tmpdir for tests.
 */
export function createTempWorkspaceRoot(prefix = 'agentsam-fs-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
