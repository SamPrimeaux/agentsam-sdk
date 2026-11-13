/**
 * Frozen third-party/editor-authored source imports are provenance-controlled
 * data fixtures, not application-authored HTML. Their original inline styles
 * and template bindings must remain byte-exact for source fidelity.
 *
 * The stock-v1 exception is intentionally stronger than a directory regex:
 * each accepted HTML file MUST appear in the committed stock catalog with a
 * matching SHA-256. New markup or an edited snapshot isn't silently excused.
 * All product TSX/CSS and authored reference wrappers stay inside the gate.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const existing = /^apps\/design-canvas\/public\/sources\/(?:agentsam|onboarding|onboarding-exports)\/(?:[A-Za-z0-9_-]+\.dc\.html|OnboardingOffersCollection\.html)$/;
const importedStock = /^apps\/design-canvas\/public\/sources\/stock\/([a-z0-9-]+)\/([A-Za-z0-9_-]+\.dc\.html)$/;

export function isImmutableDesignReference(file) {
  if (existing.test(file)) return true;
  const match = importedStock.exec(file);
  if (!match) return false;
  try {
    const catalog = JSON.parse(readFileSync(path.join(root,'apps/design-canvas/public/sources/stock/catalog.json'),'utf8'));
    if (catalog.schema !== 'agentsam.platform-stock.v1') return false;
    const item = catalog.items?.find(x => x.slug === match[1] && x.source === 'user-provided-export');
    const record = item?.files?.find(x => x.path === match[2]);
    if (!record?.sha256 || !/^[a-f0-9]{64}$/.test(record.sha256)) return false;
    const contents = readFileSync(path.join(root,file));
    return createHash('sha256').update(contents).digest('hex') === record.sha256 &&
      contents.length === record.bytes;
  } catch { return false; }
}
