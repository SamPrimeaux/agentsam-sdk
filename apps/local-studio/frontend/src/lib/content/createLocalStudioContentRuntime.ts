/**
 * Local Studio ContentRuntime host adapter (Path A mount).
 *
 * Brand meaning stays in BrandPack / ContentBrandResolver projections.
 * Knowledge + BrandSimilarity are noop unless the host injects adapters.
 * Never hardcodes Vectorize. Production never seeds fictional demo brands.
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
import { createLocalStudioImageOptimizer } from "./imageOptimize";

/** No-op similarity — Local Studio does not hardcode Vectorize. */
export const noopBrandSimilarity: BrandSimilarityAdapter = {
  async rank() {
    return [];
  },
};

/**
 * Projection resolver from host-supplied BrandPack candidates.
 * Empty projections → noop list/match (fail closed on brand identity).
 */
export function createProjectionBrandResolver(
  projections: BrandCandidate[] = [],
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
      if (!projections.length) return null;
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
  /** Required — resolve from AuthProvider/session. No production default. */
  accountId: string;
  /** Required — resolve from AuthProvider/session. No production default. */
  actorRef: string;
  accountLabel?: string;
  /**
   * Host BrandPack projections only. Defaults to empty (noop).
   * Fictional fixtures belong in tests/examples — never silent production seed.
   */
  brandProjections?: BrandCandidate[];
  /** Site/project scope for Sites → Media assets. */
  projectId?: string;
  /** Optional override for tests. */
  config?: Partial<ContentRuntimeConfig>;
}

/**
 * Construct the account-scoped ContentRuntime Local Studio mounts into Content Studio.
 * Throws when account/actor identity is missing (fail closed).
 * CF Images uses shared `@inneranimalmedia/agentsam-cloudflare-images` via content
 * provider adapters when the host injects credentials — not hardcoded here.
 */
export function createLocalStudioContentRuntime(
  opts: LocalStudioContentRuntimeOptions,
): ContentRuntime {
  const accountId = String(opts.accountId || "").trim();
  const actorRef = String(opts.actorRef || "").trim();
  if (!accountId || !actorRef) {
    throw new Error("content_runtime_identity_required");
  }

  const projections = opts.brandProjections ?? [];
  const local = localFiles();
  const localHost = createLocalStudioLocalContentHost();
  const imageOptimizer = createLocalStudioImageOptimizer();

  return createContentRuntime({
    identity: { type: "human", ref: actorRef },
    account: {
      id: accountId,
      label: opts.accountLabel ?? accountId,
    },
    providers: [local],
    brandResolver: createProjectionBrandResolver(projections),
    knowledge: noopKnowledgeAdapter,
    localHost,
    imageOptimizer,
    assistant: buildAssistant(projections),
    ...opts.config,
  });
}
