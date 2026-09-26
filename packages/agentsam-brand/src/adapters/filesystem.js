import fs from 'node:fs';
import path from 'node:path';

/** Local filesystem storage adapter (offline planning/publish for tests & DIY). */
export class FilesystemStorageAdapter {
  constructor({ rootDir } = {}) {
    this.rootDir = path.resolve(rootDir || path.join(process.cwd(), '.agentsam', 'brand-store'));
    this.kind = 'filesystem';
  }

  resolve(key) {
    const safe = String(key || '').replace(/^\/+/, '');
    if (safe.includes('..')) throw new Error('path_traversal');
    return path.join(this.rootDir, safe);
  }

  async put(key, buffer, meta = {}) {
    const file = this.resolve(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    if (meta && Object.keys(meta).length) {
      fs.writeFileSync(`${file}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
    }
    return { ok: true, key, path: file };
  }

  async get(key) {
    const file = this.resolve(key);
    if (!fs.existsSync(file)) return null;
    return { key, buffer: fs.readFileSync(file), path: file };
  }

  async head(key) {
    const file = this.resolve(key);
    if (!fs.existsSync(file)) return { exists: false };
    const buffer = fs.readFileSync(file);
    return { exists: true, bytes: buffer.length, buffer, path: file };
  }

  async exists(key) {
    return fs.existsSync(this.resolve(key));
  }

  async list(prefix = '') {
    const out = [];
    const walk = (dir, rel = '') => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.endsWith('.meta.json')) continue;
        const full = path.join(dir, name);
        const key = rel ? `${rel}/${name}` : name;
        if (fs.statSync(full).isDirectory()) walk(full, key);
        else if (!prefix || key.startsWith(prefix)) out.push(key);
      }
    };
    walk(this.rootDir);
    return out;
  }
}
