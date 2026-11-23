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

  const ignored = new Set(['node_modules', 'dist', '.output', 'target', 'public', '.git', '.agentsam', 'test', 'tests', 'fixtures']);
  function scanDirectory(dir, depth, maxDepth) {
    if (!fs.existsSync(dir)) return;
    const manifestPath = path.join(dir, 'agentsam.app.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.schema !== 'agentsam.app.v1' || manifest.kind !== 'app') {
        throw new Error(`invalid_app_manifest_kind:${manifestPath}`);
      }
      const id = manifest.id || path.basename(dir);
      if (seen.has(id)) throw new Error(`duplicate_app_manifest_id:${id}`);
      seen.add(id);
      out.push({
        id,
        name: manifest.name || path.basename(dir),
        dir,
        manifestPath,
        bin: manifest.bin || null,
        commands: manifest.commands || {},
        manifest,
      });
    }
    if (depth >= maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      scanDirectory(path.join(dir, entry.name), depth + 1, maxDepth);
    }
  }
  // Includes nested host-owned applications, such as AgentSamForms.
  // Package modules and plugins no longer carry agentsam.app.json.
  scanDirectory(path.join(root, 'apps'), 0, 4);
  scanDirectory(path.join(root, 'packages'), 0, 2);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
