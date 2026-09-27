/**
 * Two-pass intelligence record.
 *
 * machine: cheap deterministic facts — computed locally, never by an LLM.
 * semantic: AI enrichment layered on top of the machine facts.
 */

export interface MachineFacts {
  hash?: string; // sha-256 hex of the master bytes
  mimeSniffed?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  hasAlpha?: boolean;
  bytes?: number;
  exif?: Record<string, string | number>;
  duplicateOf?: string; // asset id with identical hash
  computedAt?: string;
}

export interface SemanticEnrichment {
  subject?: string;
  description?: string;
  role?: string;
  altProposal?: string;
  captionProposal?: string;
  semanticFilename?: string;
  campaignRelevance?: string[];
  brandMatch?: { brandId: string; confidence: number };
  qualityConcerns?: string[];
  enrichedAt?: string;
  enrichedBy?: string; // model identifier
}

export interface ContentIntelligence {
  machine?: MachineFacts;
  semantic?: SemanticEnrichment;
  /** Embedding/AutoRAG sync bookkeeping, account scoped. */
  rag?: { indexedAt?: string; index?: string; documentId?: string };
}
