/**
 * Local Studio ContentRuntime host adapter (Path A mount).
 *
 * Brand meaning stays in BrandPack / ContentBrandResolver projections.
 * Knowledge + BrandSimilarity are noop unless the host injects adapters.
 * Never hardcodes Vectorize. Demo brands are fictional only.
 */
import {
  createContentRuntime,
  inferBrandAssociation,
  localFiles,
  noopKnowledgeAdapter,
  proposeAlt,
  proposeSemanticAlias,
  proposeTags,
  type AssistantHandler,
  type BrandCandidate,
  type BrandSimilarityAdapter,
  type ContentBrandResolver,
  type ContentRuntime,
  type ContentRuntimeConfig,
} from "@inneranimalmedia/agentsam-content";
import { createLocalStudioLocalContentHost } from "./localContentHost";

/** Fictional demo projections only — never real customer BrandPack fixtures. */
export const DEMO_BRAND_PROJECTIONS: BrandCandidate[] = [
  {
    brandId: "northwind-garage",
    name: "Northwind Garage",
    keywords: ["garage", "car", "fuel", "emblem", "workbench"],
  },
  {
    brandId: "cedar-studio",
    name: "Cedar Studio",
    keywords: ["studio", "media", "animal", "creative"],
  },
];

/** No-op similarity — Local Studio does not hardcode Vectorize. */
export const noopBrandSimilarity: BrandSimilarityAdapter = {
  async rank() {
    return [];
  },
};

export function createProjectionBrandResolver(
  projections: BrandCandidate[] = DEMO_BRAND_PROJECTIONS,
): ContentBrandResolver {
  const byId = new Map(projections.map((p) => [p.brandId, p]));
  return {
    async get(id) {
      const p = byId.get(id);
      if (!p) return null;
      return { id: p.brandId, name: p.name, keywords: p.keywords };
    },
    async list() {
      return projections.map((p) => ({
        id: p.brandId,
        name: p.name,
        keywords: p.keywords,
      }));
    },
    async match(asset) {
      if (asset.brandId && byId.has(asset.brandId)) {
        return {
          brandId: asset.brandId,
          confidence: 1,
          evidence: ["explicit-association"],
        };
      }
      const hay = [
        asset.title,
        asset.filename,
        asset.semanticAlias,
        asset.alt,
        asset.caption,
        asset.subject,
        asset.description,
        ...(asset.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      for (const p of projections) {
        const hits = (p.keywords ?? []).filter((k) => hay.includes(k.toLowerCase()));
        if (hits.length) {
          return {
            brandId: p.brandId,
            confidence: Math.min(0.85, 0.35 + hits.length * 0.15),
            evidence: hits.map((h) => `keyword:${h}`),
          };
        }
      }
      return null;
    },
  };
}

function buildAssistant(projections: BrandCandidate[]): AssistantHandler {
  return {
    async run(action, ctx) {
      const a = ctx.asset;
      switch (action) {
        case "describe": {
          const m = a.intelligence?.machine;
          return [
            `${a.kind} · ${a.state} · origin ${a.origin}`,
            m?.width ? `dimensions ${m.width}×${m.height}` : null,
            a.bytes ? `${Math.round(a.bytes / 1024)} KB` : null,
          ]
            .filter(Boolean)
            .join("\n");
        }
        case "write-alt":
          return proposeAlt(a) ?? "Add a subject/description first.";
        case "rename-semantic":
          return `Proposed alias: ${proposeSemanticAlias(a)}`;
        case "tag":
          return `Proposed tags: ${proposeTags(a).join(", ") || "none"}`;
        case "identify-brand": {
          const match = await inferBrandAssociation(a, projections, {
            similarity: noopBrandSimilarity,
          });
          return match
            ? `${match.brandId} (score ${match.scoreCard.score.toFixed(0)}, confidence ${(match.confidence * 100).toFixed(0)}%)`
            : "No brand association proposal from current metadata.";
        }
        case "where-used":
          return ctx.deleteSafety.totalReferences === 0
            ? "Not referenced by any surface."
            : a.usage.map((u) => `${u.app} / ${u.surface}`).join("\n");
        case "delete-safety":
          return ctx.deleteSafety.reason;
        default:
          return `Local Studio content action: ${action}`;
      }
    },
  };
}

export interface LocalStudioContentRuntimeOptions {
  accountId?: string;
  accountLabel?: string;
  actorRef?: string;
  /** Production hosts pass BrandPack projections; demos use fictional defaults. */
  brandProjections?: BrandCandidate[];
  /** Optional override for tests. */
  config?: Partial<ContentRuntimeConfig>;
}

/**
 * Construct the account-scoped ContentRuntime Local Studio mounts into Content Studio.
 * CF Images uses shared `@inneranimalmedia/agentsam-cloudflare-images` via content
 * provider adapters when the host injects credentials — not hardcoded here.
 */
export function createLocalStudioContentRuntime(
  opts: LocalStudioContentRuntimeOptions = {},
): ContentRuntime {
  const projections = opts.brandProjections ?? DEMO_BRAND_PROJECTIONS;
  const local = localFiles();
  const localHost = createLocalStudioLocalContentHost();

  return createContentRuntime({
    identity: { type: "human", ref: opts.actorRef ?? "local-studio-user" },
    account: {
      id: opts.accountId ?? "acct_local_studio",
      label: opts.accountLabel ?? "Local Studio",
    },
    providers: [local],
    brandResolver: createProjectionBrandResolver(projections),
    knowledge: noopKnowledgeAdapter,
    localHost,
    assistant: buildAssistant(projections),
    ...opts.config,
  });
}
