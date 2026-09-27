/**
 * Brand projection into Content — NOT a BrandPack schema.
 *
 * BrandPack (agentsam-brand + brand.pack.json) remains the sole brand-system
 * authority including brand-scoped assets. Content only sees this projection
 * via a host-injected ContentBrandResolver.
 */

export interface ContentBrandRef {
  /** BrandPack brand id — reference only, not proof of brand meaning. */
  id: string;
  name?: string;
  /** Optional display hints the host chooses to project. */
  keywords?: string[];
}

export interface ContentBrandMatch {
  brandId: string;
  confidence: number;
  evidence: string[];
}

/**
 * Host adapts BrandPack v2 into this contract.
 * Local Studio / IAM / F&F / customers each implement differently.
 * agentsam-content must never import agentsam-brand for brand meaning.
 */
export interface ContentBrandResolver {
  get(id: string): Promise<ContentBrandRef | null>;
  list(): Promise<ContentBrandRef[]>;
  match(asset: {
    id: string;
    title?: string;
    filename?: string;
    semanticAlias?: string;
    alt?: string;
    caption?: string;
    tags?: string[];
    brandId?: string;
    subject?: string;
    description?: string;
  }): Promise<ContentBrandMatch | null>;
}

/** Explicit no-op for hosts without brand capability. */
export const noopBrandResolver: ContentBrandResolver = {
  async get() {
    return null;
  },
  async list() {
    return [];
  },
  async match(asset) {
    if (asset.brandId) {
      return { brandId: asset.brandId, confidence: 1, evidence: ["explicit-association"] };
    }
    return null;
  },
};
