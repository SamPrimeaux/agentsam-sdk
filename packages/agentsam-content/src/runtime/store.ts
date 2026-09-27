import type { ContentAsset } from "../core/asset.js";
import type { ContentQuery } from "../core/collection.js";
import { matchesQuery } from "../core/collection.js";
import type { ContentRevision } from "../core/revision.js";

export interface ListPage {
  assets: ContentAsset[];
  cursor?: string;
  total: number;
}

/**
 * Persistence boundary. In-memory for tests/Local Studio;
 * hosts implement this over D1/SQLite/KV/Postgres.
 */
export interface ContentStore {
  get(id: string): Promise<ContentAsset | null>;
  put(asset: ContentAsset): Promise<void>;
  delete(id: string): Promise<void>;
  list(query?: ContentQuery): Promise<ListPage>;
  addRevision(revision: ContentRevision): Promise<void>;
  revisions(assetId: string): Promise<ContentRevision[]>;
  all(): Promise<ContentAsset[]>;
}

export class InMemoryContentStore implements ContentStore {
  private assets = new Map<string, ContentAsset>();
  private revs: ContentRevision[] = [];

  async get(id: string): Promise<ContentAsset | null> {
    return this.assets.get(id) ?? null;
  }

  async put(asset: ContentAsset): Promise<void> {
    this.assets.set(asset.id, asset);
  }

  async delete(id: string): Promise<void> {
    this.assets.delete(id);
  }

  async list(query: ContentQuery = {}): Promise<ListPage> {
    const matched = [...this.assets.values()]
      .filter((a) => matchesQuery(a, query))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = query.cursor ? Number(query.cursor) : 0;
    const limit = query.limit ?? 50;
    const page = matched.slice(start, start + limit);
    return {
      assets: page,
      cursor: start + limit < matched.length ? String(start + limit) : undefined,
      total: matched.length,
    };
  }

  async addRevision(revision: ContentRevision): Promise<void> {
    this.revs.push(revision);
  }

  async revisions(assetId: string): Promise<ContentRevision[]> {
    return this.revs.filter((r) => r.assetId === assetId);
  }

  async all(): Promise<ContentAsset[]> {
    return [...this.assets.values()];
  }
}
