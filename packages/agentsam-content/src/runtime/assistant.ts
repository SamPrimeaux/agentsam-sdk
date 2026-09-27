import type { ContentAsset } from "../core/asset.js";
import type { DeleteSafety } from "../core/usage.js";
import { evaluateDeleteSafety } from "../core/usage.js";
import type { Recommendation } from "../intelligence/recommendations.js";
import { recommend } from "../intelligence/recommendations.js";
import { seoReport, type SeoReport } from "../intelligence/seo.js";

/**
 * ContentAssistantContext — the normalized contract AgentSam receives.
 * Machine facts first: the agent never has to "look" at dimensions,
 * hashes or usage. The runtime already knows them.
 */
export interface ContentAssistantContext {
  accountId: string;
  asset: ContentAsset;
  providerNames: string[];
  deleteSafety: DeleteSafety;
  recommendations: Recommendation[];
  seo: SeoReport;
  /** Which inspector/surface the user is on when asking. */
  currentInspector?: string;
  currentError?: string;
  /** Extra host-supplied context (brand pack, page, campaign...). */
  extra?: Record<string, unknown>;
}

export type AssistantActionId =
  | "describe"
  | "write-alt"
  | "rename-semantic"
  | "tag"
  | "identify-brand"
  | "find-duplicates"
  | "optimize"
  | "create-mobile-crop"
  | "create-og-variant"
  | "where-used"
  | "delete-safety"
  | "lighter-web-version"
  | "generate-product-shot"
  | "create-poster"
  | "find-related";

export interface AssistantAction {
  id: AssistantActionId;
  label: string;
  appliesTo: (asset: ContentAsset) => boolean;
}

export const ASSISTANT_ACTIONS: AssistantAction[] = [
  { id: "describe", label: "Describe this asset", appliesTo: () => true },
  { id: "write-alt", label: "Write alt text", appliesTo: (a) => a.kind === "image" },
  { id: "rename-semantic", label: "Rename semantically", appliesTo: () => true },
  { id: "tag", label: "Tag this", appliesTo: () => true },
  { id: "identify-brand", label: "Which brand does this belong to?", appliesTo: () => true },
  { id: "find-duplicates", label: "Find duplicates", appliesTo: () => true },
  { id: "optimize", label: "Optimize this", appliesTo: (a) => a.kind === "image" || a.kind === "video" },
  { id: "create-mobile-crop", label: "Create mobile crop", appliesTo: (a) => a.kind === "image" },
  { id: "create-og-variant", label: "Create OG variation", appliesTo: (a) => a.kind === "image" },
  { id: "where-used", label: "Where is this used?", appliesTo: () => true },
  { id: "delete-safety", label: "Is it safe to delete?", appliesTo: () => true },
  { id: "lighter-web-version", label: "Make a lighter web version", appliesTo: (a) => a.kind !== "font" },
  { id: "generate-product-shot", label: "Generate a product shot from this", appliesTo: (a) => a.kind === "image" || a.kind === "model" },
  { id: "create-poster", label: "Create poster from this video", appliesTo: (a) => a.kind === "video" },
  { id: "find-related", label: "Find related assets", appliesTo: () => true },
];

export interface AssistantHandler {
  run(action: AssistantActionId, context: ContentAssistantContext): Promise<unknown>;
}

export function buildAssistantContext(
  asset: ContentAsset,
  opts: {
    providerNames: string[];
    currentInspector?: string;
    currentError?: string;
    extra?: Record<string, unknown>;
  },
): ContentAssistantContext {
  return {
    accountId: asset.accountId,
    asset,
    providerNames: opts.providerNames,
    deleteSafety: evaluateDeleteSafety(asset.usage),
    recommendations: recommend(asset),
    seo: seoReport(asset),
    currentInspector: opts.currentInspector,
    currentError: opts.currentError,
    extra: opts.extra,
  };
}

export function actionsFor(asset: ContentAsset): AssistantAction[] {
  return ASSISTANT_ACTIONS.filter((a) => a.appliesTo(asset));
}
