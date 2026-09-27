import type { ContentAsset, ContentKind } from "./asset.js";
import type { ContentOrigin, ContentState } from "./origin.js";

/**
 * Collections and views are metadata queries, not physical directories.
 * "Imports", "Generated", "Live", "Unused" are all just filters.
 */
export interface ContentQuery {
  kind?: ContentKind | ContentKind[];
  origin?: ContentOrigin | ContentOrigin[];
  state?: ContentState | ContentState[];
  tags?: string[];
  brandId?: string;
  projectId?: string;
  provider?: string;
  unused?: boolean;
  needsReview?: boolean;
  needsOptimization?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ContentCollection {
  id: string;
  label: string;
  query: ContentQuery;
  system?: boolean;
}

const arr = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

export function matchesQuery(asset: ContentAsset, q: ContentQuery): boolean {
  const kinds = arr(q.kind);
  if (kinds && !kinds.includes(asset.kind)) return false;
  const origins = arr(q.origin);
  if (origins && !origins.includes(asset.origin)) return false;
  const states = arr(q.state);
  if (states && !states.includes(asset.state)) return false;
  if (q.brandId && asset.brandId !== q.brandId) return false;
  if (q.projectId && asset.projectId !== q.projectId) return false;
  if (q.provider && !asset.providerRefs.some((r) => r.provider === q.provider)) return false;
  if (q.tags && !q.tags.every((t) => asset.tags.includes(t))) return false;
  if (q.unused === true && asset.usage.some((u) => u.live && !u.detachedAt)) return false;
  if (q.needsReview === true && asset.state !== "review") return false;
  if (q.needsOptimization === true) {
    const big = (asset.bytes ?? 0) > 500_000;
    const optimized = asset.variants.some((v) => v.approved);
    if (!big || optimized) return false;
  }
  if (q.search) {
    const hay = [
      asset.title,
      asset.filename,
      asset.semanticAlias,
      asset.alt,
      asset.caption,
      asset.role,
      ...asset.tags,
      asset.intelligence?.semantic?.subject,
      asset.intelligence?.semantic?.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q.search.toLowerCase())) return false;
  }
  return true;
}

/** The default library views every host gets for free. */
export const SYSTEM_COLLECTIONS: ContentCollection[] = [
  { id: "all", label: "All", query: {}, system: true },
  { id: "images", label: "Images", query: { kind: "image" }, system: true },
  { id: "videos", label: "Videos", query: { kind: "video" }, system: true },
  { id: "models", label: "3D", query: { kind: "model" }, system: true },
  { id: "generated", label: "Generated", query: { origin: ["generated", "agent-created"] }, system: true },
  { id: "imported", label: "Imported", query: { origin: ["cms-import", "site-crawl", "provider-sync"] }, system: true },
  { id: "live", label: "Live", query: { state: "live" }, system: true },
  { id: "drafts", label: "Drafts", query: { state: "draft" }, system: true },
  { id: "needs-review", label: "Needs review", query: { needsReview: true }, system: true },
  { id: "unused", label: "Unused", query: { unused: true }, system: true },
  { id: "needs-optimization", label: "Needs optimization", query: { needsOptimization: true }, system: true },
];
