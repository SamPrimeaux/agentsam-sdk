/**
 * Brand association intelligence — proposals only, never BrandPack authority.
 *
 * Operates on BrandProjection / BrandCandidate signals from ContentBrandResolver
 * (or host-supplied candidates). Matching may use deterministic signals,
 * embeddings via BrandSimilarityAdapter, or optional LLM adjudication —
 * always returning evidence + ScoreCard, never establishing brand meaning.
 */

import type { ScoreCard } from "@inneranimalmedia/agentsam-scoring";
import { computeBrandAffinity, explainScoreCard } from "@inneranimalmedia/agentsam-scoring";
import type { ContentAsset } from "../core/asset.js";
import type { ContentBrandRef, ContentBrandResolver } from "../contracts/brand-resolver.js";

/** Signal-only projection — never a BrandPack schema. */
export interface BrandProjection {
  brandId: string;
  name?: string;
  /** Deterministic keyword / alias signals projected by the host. */
  keywords?: string[];
  colors?: string[];
  motifs?: string[];
  domains?: string[];
  /** Known brand-scoped asset ids for exact / hash overlap. */
  knownAssetIds?: string[];
}

/** Alias for inference candidate lists. */
export type BrandCandidate = BrandProjection;

export interface BrandMatchCandidate {
  brandId: string;
  score: number;
  evidence: string[];
}

/**
 * Host-injected similarity seam. Content must NOT import Vectorize / AutoRAG.
 * Hosts may implement with Vectorize, pgvector, local Ollama+SQLite, or noop.
 */
export interface BrandSimilarityAdapter {
  rank(asset: ContentAsset, candidates: BrandProjection[]): Promise<BrandMatchCandidate[]>;
}

export interface BrandAssociationProposal {
  brandId: string;
  /** 0..1 proposal confidence (from ScoreCard). */
  confidence: number;
  /** Deterministic + adapter evidence strings. */
  evidence: string[];
  /** brand-affinity ScoreCard — versioned derived view. */
  scoreCard: ScoreCard;
  /** Human-readable explainability string. */
  explanation: string;
  /** How the proposal was produced. */
  stage: "explicit" | "deterministic" | "similarity-adapter" | "exact-lookup";
}

export interface InferBrandAssociationOptions {
  /** Optional embedding / semantic ranker (host-injected). */
  similarity?: BrandSimilarityAdapter;
  /** Freeze computedAt for tests. */
  computedAt?: string;
}

function haystack(asset: ContentAsset): string {
  return [
    asset.title,
    asset.filename,
    asset.semanticAlias,
    asset.alt,
    asset.caption,
    ...asset.tags,
    asset.intelligence?.semantic?.subject,
    asset.intelligence?.semantic?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function projectionFromRef(ref: ContentBrandRef): BrandProjection {
  return {
    brandId: ref.id,
    name: ref.name,
    keywords: ref.keywords,
  };
}

/**
 * Exact / resolved lookup against ContentBrandResolver — not inference.
 * Prefer this when the caller already has a brand id or known alias.
 */
export async function matchKnownBrandId(
  resolver: ContentBrandResolver,
  brandId: string,
): Promise<ContentBrandRef | null> {
  return resolver.get(brandId);
}

/**
 * Deterministic signal scan for one candidate. Returns component raws + evidence.
 */
export function scoreDeterministicSignals(
  asset: ContentAsset,
  candidate: BrandProjection,
): { raws: Record<string, number>; evidence: string[] } {
  const hay = haystack(asset);
  const evidence: string[] = [];
  const raws: Record<string, number> = {
    "known-asset": 0,
    "logo-mark": 0,
    "names-domains-metadata": 0,
    palette: 0,
    typography: 0,
    "imagery-style": 0,
    "contextual-usage": 0,
  };

  if (candidate.knownAssetIds?.includes(asset.id)) {
    raws["known-asset"] = 1;
    evidence.push(`known-asset:${asset.id}`);
  }

  const nameTerms = [candidate.name, ...(candidate.domains ?? [])].filter(Boolean) as string[];
  const nameHits = nameTerms.filter((t) => t && hay.includes(t.toLowerCase()));
  const keywordTerms = [...(candidate.keywords ?? []), ...(candidate.motifs ?? [])];
  const keywordHits = keywordTerms.filter((t) => t && hay.includes(t.toLowerCase()));
  const metaHits = [...nameHits, ...keywordHits];
  if (metaHits.length > 0) {
    const denom = Math.max(3, (nameTerms.length + keywordTerms.length) * 0.5);
    raws["names-domains-metadata"] = Math.min(1, metaHits.length / denom);
    evidence.push(...metaHits.map((m) => `meta:${m}`));
  }

  const role = (asset.role ?? "").toLowerCase();
  if (role === "logo" || role === "mark" || asset.tags.some((t) => /logo|mark|emblem/i.test(t))) {
    if (keywordHits.some((k) => /logo|mark|emblem|icon/i.test(k)) || nameHits.length > 0) {
      raws["logo-mark"] = Math.min(1, 0.4 + (raws["names-domains-metadata"] ?? 0) * 0.6);
      evidence.push("role:logo-or-mark");
    }
  }

  if (candidate.colors?.length && asset.intelligence?.machine?.exif) {
    // Placeholder: host/adapters supply real palette overlap; keep deterministic zero unless wired.
    raws.palette = 0;
  }

  if (asset.usage.some((u) => u.app === candidate.brandId || u.surface.includes(candidate.brandId))) {
    raws["contextual-usage"] = 1;
    evidence.push(`usage:${candidate.brandId}`);
  }

  return { raws, evidence };
}

function proposalFromSignals(
  brandId: string,
  raws: Record<string, number>,
  evidence: string[],
  stage: BrandAssociationProposal["stage"],
  opts?: InferBrandAssociationOptions,
  activePenalties?: string[],
): BrandAssociationProposal {
  const scoreCard = computeBrandAffinity({
    id: `brand-affinity:${brandId}`,
    raws,
    evidenceRefs: evidence,
    activePenalties,
    confidence: Math.min(1, evidence.length / 3),
    computedAt: opts?.computedAt,
  });
  return {
    brandId,
    confidence: scoreCard.confidence,
    evidence,
    scoreCard,
    explanation: explainScoreCard(scoreCard).formula,
    stage,
  };
}

/**
 * Infer which known brand an asset most likely belongs to.
 * Returns a proposal + brand-affinity ScoreCard — never BrandPack authority.
 *
 * Explicit `asset.brandId` wins as exact association (stage: explicit).
 */
export async function inferBrandAssociation(
  asset: ContentAsset,
  candidates: BrandProjection[],
  opts?: InferBrandAssociationOptions,
): Promise<BrandAssociationProposal | undefined> {
  if (asset.brandId) {
    const explicit = candidates.find((c) => c.brandId === asset.brandId);
    const raws: Record<string, number> = {
      "known-asset": 1,
      "logo-mark": 0,
      "names-domains-metadata": 1,
      palette: 0,
      typography: 0,
      "imagery-style": 0,
      "contextual-usage": 0,
    };
    return proposalFromSignals(
      asset.brandId,
      raws,
      ["explicit-association", ...(explicit ? [`candidate:${explicit.brandId}`] : [])],
      "explicit",
      opts,
    );
  }

  let best: BrandAssociationProposal | undefined;

  for (const candidate of candidates) {
    const { raws, evidence } = scoreDeterministicSignals(asset, candidate);
    if (evidence.length === 0) continue;
    const proposal = proposalFromSignals(candidate.brandId, raws, evidence, "deterministic", opts);
    if (!best || proposal.scoreCard.score > best.scoreCard.score) best = proposal;
  }

  if (opts?.similarity && candidates.length > 0) {
    const ranked = await opts.similarity.rank(asset, candidates);
    for (const hit of ranked) {
      const raws: Record<string, number> = {
        "known-asset": 0,
        "logo-mark": Math.min(1, hit.score),
        "names-domains-metadata": 0,
        palette: 0,
        typography: 0,
        "imagery-style": Math.min(1, hit.score * 0.8),
        "contextual-usage": 0,
      };
      const proposal = proposalFromSignals(
        hit.brandId,
        raws,
        hit.evidence,
        "similarity-adapter",
        opts,
      );
      if (!best || proposal.scoreCard.score > best.scoreCard.score) best = proposal;
    }
  }

  return best;
}

/**
 * Convenience: list projections from a ContentBrandResolver then infer.
 */
export async function inferBrandAssociationFromResolver(
  asset: ContentAsset,
  resolver: ContentBrandResolver,
  opts?: InferBrandAssociationOptions,
): Promise<BrandAssociationProposal | undefined> {
  if (asset.brandId) {
    const known = await matchKnownBrandId(resolver, asset.brandId);
    const candidates = known ? [projectionFromRef(known)] : [{ brandId: asset.brandId }];
    return inferBrandAssociation(asset, candidates, opts);
  }
  const refs = await resolver.list();
  return inferBrandAssociation(asset, refs.map(projectionFromRef), opts);
}

/**
 * @deprecated Use `inferBrandAssociation`. Kept as a thin sync wrapper for
 * deterministic-only call sites during migration.
 */
export function matchBrand(
  asset: ContentAsset,
  candidates: BrandProjection[],
): { brandId: string; confidence: number; matchedOn: string[] } | undefined {
  // Sync path: deterministic only (no adapter).
  if (asset.brandId) {
    return { brandId: asset.brandId, confidence: 1, matchedOn: ["explicit-association"] };
  }
  let best: { brandId: string; confidence: number; matchedOn: string[]; score: number } | undefined;
  for (const candidate of candidates) {
    const { raws, evidence } = scoreDeterministicSignals(asset, candidate);
    if (evidence.length === 0) continue;
    const card = computeBrandAffinity({
      id: `brand-affinity:${candidate.brandId}`,
      raws,
      evidenceRefs: evidence,
      confidence: Math.min(1, evidence.length / 3),
      computedAt: "1970-01-01T00:00:00.000Z",
    });
    if (!best || card.score > best.score) {
      best = {
        brandId: candidate.brandId,
        confidence: card.confidence,
        matchedOn: evidence,
        score: card.score,
      };
    }
  }
  if (!best) return undefined;
  return { brandId: best.brandId, confidence: best.confidence, matchedOn: best.matchedOn };
}

/** @deprecated Use BrandAssociationProposal fields. */
export type BrandMatchResult = {
  brandId: string;
  confidence: number;
  matchedOn: string[];
};