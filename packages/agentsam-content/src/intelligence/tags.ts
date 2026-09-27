import type { ContentAsset } from "../core/asset.js";

/** Deterministic tag proposals from facts the runtime already knows. */
export function proposeTags(asset: ContentAsset): string[] {
  const proposals = new Set<string>();

  proposals.add(asset.kind);
  if (asset.origin === "generated" || asset.origin === "agent-created") proposals.add("generated");
  if (asset.origin === "cms-import" || asset.origin === "site-crawl") proposals.add("imported");
  if (asset.role) proposals.add(asset.role);
  if (asset.brandId) proposals.add(`brand:${asset.brandId}`);
  if (asset.projectId) proposals.add(`project:${asset.projectId}`);

  const m = asset.intelligence?.machine;
  if (m?.hasAlpha) proposals.add("transparent");
  if (asset.kind === "image" && asset.width && asset.height) {
    const ratio = asset.width / asset.height;
    if (Math.abs(ratio - 1) < 0.05) proposals.add("square");
    else if (ratio > 1.7) proposals.add("wide");
    else if (ratio < 0.7) proposals.add("portrait");
    if (asset.width >= 1920) proposals.add("hires");
  }
  if (asset.kind === "video" && asset.durationMs !== undefined) {
    if (asset.durationMs <= 15_000) proposals.add("clip");
    else if (asset.durationMs >= 120_000) proposals.add("longform");
  }

  const semantic = asset.intelligence?.semantic;
  for (const c of semantic?.campaignRelevance ?? []) proposals.add(c);

  // Never re-propose existing tags
  for (const t of asset.tags) proposals.delete(t);
  return [...proposals];
}
