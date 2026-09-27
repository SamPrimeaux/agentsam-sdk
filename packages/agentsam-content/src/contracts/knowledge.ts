/**
 * Neutral knowledge / retrieval boundary.
 *
 * Hosts inject Vectorize, AutoRAG, pgvector, Supabase, SQLite, Ollama,
 * hybrid, or none. Content emits normalized documents only — never owns
 * embedding-provider selection. Indexes are derived and rebuildable.
 */

export interface ContentKnowledgeDocument {
  assetId: string;
  accountId: string;
  brandId?: string;
  kind: string;
  semanticName?: string;
  altText?: string;
  tags: string[];
  machineFacts?: Record<string, unknown>;
  provenanceSummary?: string;
  usageSummary?: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface ContentKnowledgeQuery {
  accountId: string;
  query: string;
  limit?: number;
  kind?: string;
  brandId?: string;
}

export interface ContentKnowledgeResult {
  assetId: string;
  score: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface IndexReceipt {
  documentId: string;
  index?: string;
  indexedAt: string;
}

export interface ContentKnowledgeCapabilities {
  index: boolean;
  remove: boolean;
  search: boolean;
  enrich: boolean;
  /** Opaque host labels, e.g. ["vectorize", "autorag"] — never required by Content. */
  backends?: string[];
}

export interface ContentKnowledgeAdapter {
  capabilities(): ContentKnowledgeCapabilities;
  index(document: ContentKnowledgeDocument): Promise<IndexReceipt>;
  remove(assetId: string): Promise<void>;
  search(query: ContentKnowledgeQuery): Promise<ContentKnowledgeResult[]>;
  enrich?(document: ContentKnowledgeDocument): Promise<ContentKnowledgeDocument>;
}

export const noopKnowledgeAdapter: ContentKnowledgeAdapter = {
  capabilities: () => ({ index: false, remove: false, search: false, enrich: false, backends: [] }),
  async index() {
    return { documentId: "noop", indexedAt: new Date().toISOString() };
  },
  async remove() {},
  async search() {
    return [];
  },
};

/** Compose multiple host knowledge backends without forking Content. */
export function hybridKnowledgeAdapter(
  adapters: ContentKnowledgeAdapter[],
): ContentKnowledgeAdapter {
  return {
    capabilities() {
      return {
        index: adapters.some((a) => a.capabilities().index),
        remove: adapters.some((a) => a.capabilities().remove),
        search: adapters.some((a) => a.capabilities().search),
        enrich: adapters.some((a) => Boolean(a.enrich) && a.capabilities().enrich),
        backends: adapters.flatMap((a) => a.capabilities().backends ?? []),
      };
    },
    async index(document) {
      const receipts = await Promise.all(
        adapters.filter((a) => a.capabilities().index).map((a) => a.index(document)),
      );
      return receipts[0] ?? { documentId: "noop", indexedAt: new Date().toISOString() };
    },
    async remove(assetId) {
      await Promise.all(
        adapters.filter((a) => a.capabilities().remove).map((a) => a.remove(assetId)),
      );
    },
    async search(query) {
      const batches = await Promise.all(
        adapters.filter((a) => a.capabilities().search).map((a) => a.search(query)),
      );
      return batches.flat().sort((a, b) => b.score - a.score);
    },
  };
}
