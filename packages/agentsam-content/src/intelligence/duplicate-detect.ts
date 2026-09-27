import type { ContentAsset } from "../core/asset.js";

export interface DuplicateGroup {
  hash: string;
  assetIds: string[];
}

/** Exact duplicate groups by content hash (machine facts). */
export function findDuplicateGroups(assets: Iterable<ContentAsset>): DuplicateGroup[] {
  const byHash = new Map<string, string[]>();
  for (const a of assets) {
    const hash = a.intelligence?.machine?.hash;
    if (!hash) continue;
    const list = byHash.get(hash) ?? [];
    list.push(a.id);
    byHash.set(hash, list);
  }
  return [...byHash.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([hash, assetIds]) => ({ hash, assetIds }));
}

/** Near-duplicate candidates: same kind + same dimensions + close size. */
export function findNearDuplicates(
  asset: ContentAsset,
  others: Iterable<ContentAsset>,
  sizeTolerance = 0.1,
): string[] {
  const out: string[] = [];
  for (const o of others) {
    if (o.id === asset.id || o.kind !== asset.kind) continue;
    if (asset.width && asset.height && o.width === asset.width && o.height === asset.height) {
      const a = asset.bytes ?? 0;
      const b = o.bytes ?? 0;
      if (a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= sizeTolerance) {
        out.push(o.id);
      }
    }
  }
  return out;
}
