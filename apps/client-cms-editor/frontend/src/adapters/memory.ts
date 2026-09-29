import {
  CmsCapabilityError,
  type CmsAsset,
  type CmsEditorAdapter,
  type CmsPublicationSnapshot,
  type CmsRevision,
} from '../../../shared/cms/src/adapter';
import type {
  CmsEditorBlock,
  CmsEditorPage,
  CmsEditorSection,
  CmsEditorSite,
} from '../../../shared/cms/src/editor-types';

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function cloneSite(site: CmsEditorSite): CmsEditorSite {
  return structuredClone(site);
}

/**
 * Explicit in-memory adapter for sandboxes/tests.
 * Must be seeded intentionally. UI must label it ephemeral — never pretend to be durable.
 */
export class MemoryCmsAdapter implements CmsEditorAdapter {
  readonly ephemeral = true;
  private site: CmsEditorSite;
  private revisions = new Map<string, CmsRevision[]>();
  private published = new Map<string, CmsPublicationSnapshot>();
  private assets: CmsAsset[] = [];

  constructor(site: CmsEditorSite) {
    this.site = cloneSite(site);
  }

  static fromSite(site: CmsEditorSite) {
    return new MemoryCmsAdapter(site);
  }

  private pageOrThrow(pageId: string) {
    const page = this.site.pages.find((p) => p.id === pageId);
    if (!page) throw new CmsCapabilityError('getPage', `page_not_found:${pageId}`, 'cms_source_not_found');
    return page;
  }

  private sectionOrThrow(sectionId: string) {
    for (const page of this.site.pages) {
      const section = page.sections.find((s) => s.id === sectionId);
      if (section) return { page, section };
    }
    throw new CmsCapabilityError('getSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
  }

  private blockOrThrow(blockId: string) {
    for (const page of this.site.pages) {
      for (const section of page.sections) {
        const block = section.blocks.find((b) => b.id === blockId);
        if (block) return { page, section, block };
      }
    }
    throw new CmsCapabilityError('getBlock', `block_not_found:${blockId}`, 'cms_source_not_found');
  }

  async loadSite(siteId: string): Promise<CmsEditorSite> {
    if (siteId && siteId !== this.site.id) {
      // Allow aliasing the seeded site id for example loaders.
      this.site = { ...this.site, id: siteId };
    }
    return cloneSite(this.site);
  }

  async listPages(_siteId: string) {
    return cloneSite(this.site).pages;
  }

  async getPage(pageId: string) {
    return structuredClone(this.pageOrThrow(pageId));
  }

  async createPage(_siteId: string, input: Partial<CmsEditorPage> & { title: string; slug: string }) {
    const page: CmsEditorPage = {
      id: id('page'),
      title: input.title,
      slug: input.slug.startsWith('/') ? input.slug : `/${input.slug}`,
      status: 'draft',
      type: input.type || 'Interior',
      sections: [],
      metaTitle: input.metaTitle || input.title,
      metaDescription: input.metaDescription || '',
    };
    this.site.pages.push(page);
    return structuredClone(page);
  }

  async updatePage(pageId: string, patch: Partial<CmsEditorPage>) {
    const page = this.pageOrThrow(pageId);
    Object.assign(page, patch, { id: page.id, sections: patch.sections ?? page.sections });
    return structuredClone(page);
  }

  async deletePage(pageId: string) {
    this.site.pages = this.site.pages.filter((p) => p.id !== pageId);
    this.revisions.delete(pageId);
    this.published.delete(pageId);
  }

  async listSections(pageId: string) {
    return structuredClone(this.pageOrThrow(pageId).sections);
  }

  async getSection(sectionId: string) {
    return structuredClone(this.sectionOrThrow(sectionId).section);
  }

  async createSection(pageId: string, input: Partial<CmsEditorSection> & { name: string }) {
    const page = this.pageOrThrow(pageId);
    const section: CmsEditorSection = {
      id: id('sec'),
      name: input.name,
      type: input.type || input.name.toLowerCase().replace(/\s+/g, '-'),
      zone: input.zone || 'BODY',
      visible: input.visible !== false,
      color: input.color || '#111115',
      fields: input.fields || {},
      css: input.css || {},
      blocks: input.blocks || [],
    };
    page.sections.push(section);
    return structuredClone(section);
  }

  async updateSection(sectionId: string, patch: Partial<CmsEditorSection>) {
    const { section } = this.sectionOrThrow(sectionId);
    Object.assign(section, patch, { id: section.id, blocks: patch.blocks ?? section.blocks });
    return structuredClone(section);
  }

  async deleteSection(sectionId: string) {
    const { page } = this.sectionOrThrow(sectionId);
    page.sections = page.sections.filter((s) => s.id !== sectionId);
  }

  async reorderSections(pageId: string, sectionIds: string[]) {
    const page = this.pageOrThrow(pageId);
    const byId = new Map(page.sections.map((s) => [s.id, s]));
    page.sections = sectionIds.map((sid) => byId.get(sid)).filter(Boolean) as CmsEditorSection[];
  }

  async setSectionVisibility(sectionId: string, visible: boolean) {
    const { section } = this.sectionOrThrow(sectionId);
    section.visible = visible;
  }

  async listBlocks(sectionId: string) {
    return structuredClone(this.sectionOrThrow(sectionId).section.blocks);
  }

  async getBlock(blockId: string) {
    return structuredClone(this.blockOrThrow(blockId).block);
  }

  async createBlock(sectionId: string, input: Partial<CmsEditorBlock> & { type: string }) {
    const { section } = this.sectionOrThrow(sectionId);
    const block: CmsEditorBlock = {
      id: id('blk'),
      sectionId,
      type: input.type,
      visible: input.visible !== false,
      data: input.data || {},
      sortOrder: input.sortOrder ?? (section.blocks.length + 1) * 10,
    };
    section.blocks.push(block);
    return structuredClone(block);
  }

  async updateBlock(blockId: string, patch: Partial<CmsEditorBlock>) {
    const { block } = this.blockOrThrow(blockId);
    Object.assign(block, patch, { id: block.id });
    return structuredClone(block);
  }

  async deleteBlock(blockId: string) {
    const { section } = this.blockOrThrow(blockId);
    section.blocks = section.blocks.filter((b) => b.id !== blockId);
  }

  async reorderBlocks(sectionId: string, blockIds: string[]) {
    const { section } = this.sectionOrThrow(sectionId);
    const byId = new Map(section.blocks.map((b) => [b.id, b]));
    section.blocks = blockIds.map((bid, index) => {
      const block = byId.get(bid);
      if (!block) return null;
      block.sortOrder = (index + 1) * 10;
      return block;
    }).filter(Boolean) as CmsEditorBlock[];
  }

  async saveDraft(pageId: string, payload: unknown) {
    const page = this.pageOrThrow(pageId);
    if (payload && typeof payload === 'object' && Array.isArray((payload as any).sections)) {
      page.sections = structuredClone((payload as any).sections);
    }
    const revision: CmsRevision = {
      id: id('rev'),
      pageId,
      kind: 'draft',
      createdAt: new Date().toISOString(),
      snapshot: structuredClone(page),
    };
    const list = this.revisions.get(pageId) || [];
    list.push(revision);
    this.revisions.set(pageId, list);
    return structuredClone(revision);
  }

  async getRevision(revisionId: string) {
    for (const list of this.revisions.values()) {
      const hit = list.find((r) => r.id === revisionId);
      if (hit) return structuredClone(hit);
    }
    throw new CmsCapabilityError('getRevision', `revision_not_found:${revisionId}`, 'cms_source_not_found');
  }

  async listRevisions(pageId: string) {
    return structuredClone(this.revisions.get(pageId) || []);
  }

  async restoreRevision(pageId: string, revisionId: string) {
    const revision = await this.getRevision(revisionId);
    const snap = revision.snapshot as CmsEditorPage;
    const idx = this.site.pages.findIndex((p) => p.id === pageId);
    if (idx < 0) throw new CmsCapabilityError('restoreRevision', `page_not_found:${pageId}`, 'cms_source_not_found');
    this.site.pages[idx] = structuredClone(snap);
    return structuredClone(this.site.pages[idx]);
  }

  async previewDraft(pageId: string) {
    const page = this.pageOrThrow(pageId);
    return { snapshot: structuredClone(page) };
  }

  async publish(pageId: string, options?: { revisionId?: string }) {
    let page = this.pageOrThrow(pageId);
    if (options?.revisionId) {
      page = await this.restoreRevision(pageId, options.revisionId);
    }
    page.status = 'live';
    const snapshot: CmsPublicationSnapshot = {
      publicationId: id('pub'),
      route: page.slug,
      revision: (this.revisions.get(pageId)?.length || 0) + 1,
      theme: 'default',
      sections: page.sections.map((section) => ({
        type: section.type,
        props: { ...section.fields, name: section.name, blocks: section.blocks },
      })),
      publishedAt: new Date().toISOString(),
    };
    this.published.set(pageId, snapshot);
    const revision: CmsRevision = {
      id: id('rev'),
      pageId,
      kind: 'publication',
      createdAt: snapshot.publishedAt!,
      snapshot: structuredClone(page),
    };
    const list = this.revisions.get(pageId) || [];
    list.push(revision);
    this.revisions.set(pageId, list);
    return structuredClone(snapshot);
  }

  async getPublishedRevision(pageId: string) {
    const hit = this.published.get(pageId);
    return hit ? structuredClone(hit) : null;
  }

  async listAssets(_siteId: string) {
    return structuredClone(this.assets);
  }

  async getAsset(assetId: string) {
    const hit = this.assets.find((a) => a.id === assetId);
    if (!hit) throw new CmsCapabilityError('getAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
    return structuredClone(hit);
  }

  async uploadAsset(_siteId: string, file: Blob, meta?: { name?: string; metadata?: Record<string, unknown> }) {
    const asset: CmsAsset = {
      id: id('asset'),
      name: meta?.name || 'upload',
      mimeType: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
      metadata: meta?.metadata,
    };
    this.assets.push(asset);
    return structuredClone(asset);
  }

  async updateAsset(assetId: string, patch: Partial<Pick<CmsAsset, 'name' | 'metadata' | 'url' | 'key'>>) {
    const asset = await this.getAsset(assetId);
    const idx = this.assets.findIndex((a) => a.id === assetId);
    this.assets[idx] = { ...asset, ...patch };
    return structuredClone(this.assets[idx]);
  }

  async deleteAsset(assetId: string) {
    this.assets = this.assets.filter((a) => a.id !== assetId);
  }
}
