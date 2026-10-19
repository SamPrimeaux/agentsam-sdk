/** Canonical manifest discovery shared by the SAM CLI and Local Studio's included-app packager.
 * This is a source-reading build helper, not product installation state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function listAppManifests(root = DEFAULT_ROOT) {
  const out = [];
  const seen = new Set();

  function addFromDir(parent, entryName) {
    const dir = path.join(parent, entryName);
    const manifestPath = path.join(dir, 'agentsam.app.json');
    if (!fs.existsSync(manifestPath)) return;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { return; }
    const id = manifest.id || entryName;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      name: manifest.name || entryName,
      dir,
      manifestPath,
      bin: manifest.bin || null,
      commands: manifest.commands || {},
      manifest,
    });
  }

  for (const parentName of ['apps', 'packages']) {
    const parent = path.join(root, parentName);
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) addFromDir(parent, entry.name);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
