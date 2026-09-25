import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * SkillContentResolver — adapters only; runtime never imports R2/D1 directly.
 *
 * @typedef {{
 *   get?: (key: string) => Promise<string|null>|string|null,
 * }} ObjectStoreAdapter
 *
 * @typedef {{
 *   getText?: (ref: string) => Promise<string|null>|string|null,
 * }} DatabaseContentAdapter
 */

export class SkillContentResolver {
  /**
   * @param {{
 *     objectStore?: ObjectStoreAdapter,
 *     database?: DatabaseContentAdapter,
 *     packageRootResolver?: (pkg: string) => string|null,
 *   }} [adapters]
   */
  constructor(adapters = {}) {
    this.objectStore = adapters.objectStore || null;
    this.database = adapters.database || null;
    this.packageRootResolver = adapters.packageRootResolver || null;
  }

  /**
   * @param {import('./manifest.js').SkillManifest} manifest
   * @param {{ baseDir?: string, packageRoot?: string }} [ctx]
   * @returns {Promise<{ content: string, source: string, ref: string|null }>}
   */
  async resolve(manifest, ctx = {}) {
    const source = manifest?.instructions?.source;
    if (!source) throw new Error('instructions_source_required');

    if (source === 'inline') {
      const content = String(manifest.instructions.inline ?? '');
      return { content, source, ref: null };
    }

    if (source === 'local_file') {
      const ref = String(manifest.instructions.ref || '').trim();
      if (!ref) throw new Error('local_file_ref_required');
      const base = ctx.baseDir || process.cwd();
      const filePath = path.resolve(base, ref);
      const content = fs.readFileSync(filePath, 'utf8');
      return { content, source, ref: filePath };
    }

    if (source === 'package_file') {
      const ref = String(manifest.instructions.ref || '').trim();
      if (!ref) throw new Error('package_file_ref_required');
      const root =
        ctx.packageRoot ||
        (manifest.package && this.packageRootResolver
          ? this.packageRootResolver(manifest.package)
          : null) ||
        ctx.baseDir;
      if (!root) throw new Error('package_root_required');
      const filePath = path.resolve(root, ref);
      const content = fs.readFileSync(filePath, 'utf8');
      return { content, source, ref: filePath };
    }

    if (source === 'database') {
      const ref = String(manifest.instructions.ref || '').trim();
      if (!ref) throw new Error('database_ref_required');
      if (!this.database?.getText) {
        throw new Error('database_content_adapter_required');
      }
      const content = await this.database.getText(ref);
      if (content == null) throw new Error(`database_content_missing:${ref}`);
      return { content: String(content), source, ref };
    }

    if (source === 'object_store') {
      const ref = String(manifest.instructions.ref || '').trim();
      if (!ref) throw new Error('object_store_ref_required');
      if (!this.objectStore?.get) {
        throw new Error('object_store_adapter_required');
      }
      const content = await this.objectStore.get(ref);
      if (content == null) throw new Error(`object_store_content_missing:${ref}`);
      return { content: String(content), source, ref };
    }

    throw new Error(`unsupported_instruction_source:${source}`);
  }
}

/**
 * Minimal local object-store adapter for tests (filesystem under a root).
 * Cloudflare R2 would implement the same `.get(ref)` surface.
 */
export function createFilesystemObjectStore(rootDir) {
  const root = path.resolve(rootDir);
  return {
    async get(key) {
      const file = path.resolve(root, String(key).replace(/^\/+/, ''));
      if (!file.startsWith(root + path.sep) && file !== root) {
        throw new Error('object_store_path_escape');
      }
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, 'utf8');
    },
  };
}

export function createMemoryDatabaseContent(map = new Map()) {
  return {
    async getText(ref) {
      return map.has(ref) ? map.get(ref) : null;
    },
  };
}

/** @deprecated identity only — prefer path.resolve for package roots */
export function fileUrlDirname(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}
