import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Cloudflare R2 storage via wrangler CLI.
 * Optional — planning/deriving never requires this.
 */
export class CloudflareR2StorageAdapter {
  constructor({
    bucket,
    wranglerConfig,
    cwd,
  } = {}) {
    this.kind = 'cloudflare-r2';
    this.bucket = bucket;
    this.wranglerConfig = wranglerConfig;
    this.cwd = cwd || process.cwd();
  }

  async put(key, buffer, meta = {}) {
    if (!this.bucket) throw new Error('r2_bucket_required');
    const tmpDir = path.join(this.cwd, '.agentsam', 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, `put-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.writeFileSync(tmp, buffer);
    try {
      const args = [
        'wrangler', 'r2', 'object', 'put', `${this.bucket}/${key}`,
        '--file', tmp,
        '--content-type', meta.contentType || 'application/octet-stream',
      ];
      if (this.wranglerConfig) args.push('-c', this.wranglerConfig);
      const r = spawnSync('npx', args, { cwd: this.cwd, encoding: 'utf8', env: process.env });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'wrangler_r2_put_failed');
      return { ok: true, key };
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  async head(key) {
    if (!this.bucket) return { exists: false };
    const tmp = path.join(this.cwd, '.agentsam', 'tmp', `get-${Date.now()}`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    try {
      const args = [
        'wrangler', 'r2', 'object', 'get', `${this.bucket}/${key}`,
        '--file', tmp,
      ];
      if (this.wranglerConfig) args.push('-c', this.wranglerConfig);
      const r = spawnSync('npx', args, { cwd: this.cwd, encoding: 'utf8', env: process.env });
      if (r.status !== 0) return { exists: false };
      const buffer = fs.readFileSync(tmp);
      return { exists: true, bytes: buffer.length, buffer };
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  async get(key) {
    const h = await this.head(key);
    if (!h.exists) return null;
    return { key, buffer: h.buffer };
  }

  async exists(key) {
    return (await this.head(key)).exists;
  }

  async list() {
    throw new Error('r2_list_not_implemented');
  }
}
