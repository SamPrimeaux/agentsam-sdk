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
  CmsSiteCreateInput,
  CmsSiteRecord,
  CmsSiteUpdatePatch,
} from '../../../shared/cms/src/editor-types';

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function cloneSite(site: CmsEditorSite): CmsEditorSite {
  return structuredClone(site);
}

function siteRecordFrom(site: CmsEditorSite): CmsSiteRecord {
  const { pages: _pages, ...record } = site;
  return structuredClone(record);
}

function buildSiteRecord(input: CmsSiteCreateInput & { id: string }): CmsSiteRecord {
  const name = input.name.trim() || 'Untitled';
  return {
    id: input.id,
    name,
    initials:
      input.initials?.trim() ||
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() ||
      'CMS',
    domain: input.domain ?? '',
    edited: 'just now',
    color: input.color ?? '#1e6a6f',
    theme: input.theme ? structuredClone(input.theme) : undefined,
    schemas: input.schemas ? structuredClone(input.schemas) : undefined,
  };
}

type SiteStore = {
  meta: CmsSiteRecord;
  pages: CmsEditorPage[];
  revisions: Map<string, CmsRevision[]>;
  published: Map<string, CmsPublicationSnapshot>;
  assets: CmsAsset[];
};

/**
 * Explicit in-memory adapter for sandboxes/tests/preview.
 * Temporary adapter authority — never pretend to be durable SQLite/D1/HTTP persistence.
 */
export class MemoryCmsAdapter implements CmsEditorAdapter {
  /** True when this adapter is not durable across reloads/processes. */
  readonly temporary = true;
  private sites = new Map<string, SiteStore>();

  /** Genuinely empty store — use installStarterPack / createSite to populate. */
  static createEmpty() {
    return new MemoryCmsAdapter();
  }

  /** Convenience: empty adapter + one site shell (tests only — not required for starter install). */
  static async withSite(siteId: string, name = 'Untitled') {
    const adapter = MemoryCmsAdapter.createEmpty();
    await adapter.createSite({ id: siteId, name, domain: '' });
    return adapter;
  }

  /** @deprecated Prefer createEmpty() + installStarterPack() or createSite(). */
  static empty(siteId: string, name = 'Untitled') {
    const adapter = new MemoryCmsAdapter();
    const meta = buildSiteRecord({ id: siteId, name, domain: '' });
    adapter.sites.set(siteId, {
      meta,
      pages: [],
      revisions: new Map(),
      published: new Map(),
      assets: [],
    });
    return adapter;
  }

  static fromSite(site: CmsEditorSite) {
    const adapter = new MemoryCmsAdapter();
    adapter.sites.set(site.id, {
      meta: siteRecordFrom(site),
      pages: structuredClone(site.pages),
      revisions: new Map(),
      published: new Map(),
      assets: [],
    });
    return adapter;
  }

  private storeOrThrow(siteId: string) {
    const store = this.sites.get(siteId);
    if (!store) {
      throw new CmsCapabilityError('getSite', `site_not_found:${siteId}`, 'cms_source_not_found');
    }
    return store;
  }

  private pageOrThrow(siteId: string, pageId: string) {
    const store = this.storeOrThrow(siteId);
    const page = store.pages.find((p) => p.id === pageId);
    if (!page) throw new CmsCapabilityError('getPage', `page_not_found:${pageId}`, 'cms_source_not_found');
    return { store, page };
  }

  private findPage(pageId: string) {
    for (const [siteId, store] of this.sites) {
      const page = store.pages.find((p) => p.id === pageId);
      if (page) return { siteId, store, page };
    }
    throw new CmsCapabilityError('getPage', `page_not_found:${pageId}`, 'cms_source_not_found');
  }

  private sectionOrThrow(sectionId: string) {
    for (const [siteId, store] of this.sites) {
      for (const page of store.pages) {
        const section = page.sections.find((s) => s.id === sectionId);
        if (section) return { siteId, store, page, section };
      }
    }
    throw new CmsCapabilityError('getSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
  }

  private blockOrThrow(blockId: string) {
    for (const [siteId, store] of this.sites) {
      for (const page of store.pages) {
        for (const section of page.sections) {
          const block = section.blocks.find((b) => b.id === blockId);
          if (block) return { siteId, store, page, section, block };
        }
      }
    }
    throw new CmsCapabilityError('getBlock', `block_not_found:${blockId}`, 'cms_source_not_found');
  }

  async listSites(): Promise<CmsSiteRecord[]> {
    return [...this.sites.values()].map((store) => structuredClone(store.meta));
  }

  async getSite(siteId: string): Promise<CmsSiteRecord> {
    return structuredClone(this.storeOrThrow(siteId).meta);
  }

  async createSite(input: CmsSiteCreateInput): Promise<CmsSiteRecord> {
    const siteId = String(input.id || id('site')).trim();
    if (!siteId) throw new Error('cms_site_id_required');
    if (this.sites.has(siteId)) {
      throw new CmsCapabilityError('createSite', `site_exists:${siteId}`, 'cms_capability_unsupported');
    }
    const meta = buildSiteRecord({ ...input, id: siteId });
    this.sites.set(siteId, {
      meta,
      pages: [],
      revisions: new Map(),
      published: new Map(),
      assets: [],
    });
    return structuredClone(meta);
  }

  async updateSite(siteId: string, patch: CmsSiteUpdatePatch): Promise<CmsSiteRecord> {
    const store = this.storeOrThrow(siteId);
    store.meta = {
      ...store.meta,
      ...patch,
      id: siteId,
      theme: patch.theme !== undefined ? structuredClone(patch.theme) : store.meta.theme,
      schemas: patch.schemas !== undefined ? structuredClone(patch.schemas) : store.meta.schemas,
    };
    if (patch.name || patch.initials || patch.color) {
      store.meta.edited = 'just now';
    }
    return structuredClone(store.meta);
  }

  async deleteSite(siteId: string): Promise<void> {
    if (!this.sites.delete(siteId)) {
      throw new CmsCapabilityError('deleteSite', `site_not_found:${siteId}`, 'cms_source_not_found');
    }
  }

  async loadSite(siteId: string): Promise<CmsEditorSite> {
    const store = this.storeOrThrow(siteId);
    return cloneSite({
      ...store.meta,
      pages: structuredClone(store.pages),
    });
  }

  async listPages(siteId: string) {
    return structuredClone(this.storeOrThrow(siteId).pages);
  }

  async getPage(pageId: string) {
    const { page } = this.findPage(pageId);
    return structuredClone(page);
  }

  async createPage(siteId: string, input: Partial<CmsEditorPage> & { title: string; slug: string }) {
    const store = this.storeOrThrow(siteId);
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
    store.pages.push(page);
    store.meta.edited = 'just now';
    return structuredClone(page);
  }

  async updatePage(pageId: string, patch: Partial<CmsEditorPage>) {
    const { store, page } = this.findPage(pageId);
    Object.assign(page, patch, { id: page.id, sections: patch.sections ?? page.sections });
    store.meta.edited = 'just now';
    return structuredClone(page);
  }

  async deletePage(pageId: string) {
    const { store } = this.findPage(pageId);
    store.pages = store.pages.filter((p) => p.id !== pageId);
    store.revisions.delete(pageId);
    store.published.delete(pageId);
    store.meta.edited = 'just now';
  }

  async listSections(pageId: string) {
    const { page } = this.findPage(pageId);
    return structuredClone(page.sections);
  }

  async getSection(sectionId: string) {
    return structuredClone(this.sectionOrThrow(sectionId).section);
  }

  async createSection(pageId: string, input: Partial<CmsEditorSection> & { name: string }) {
    const { store, page } = this.findPage(pageId);
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
    store.meta.edited = 'just now';
    return structuredClone(section);
  }

  async updateSection(sectionId: string, patch: Partial<CmsEditorSection>) {
    const { store, section } = this.sectionOrThrow(sectionId);
    Object.assign(section, patch, { id: section.id, blocks: patch.blocks ?? section.blocks });
    store.meta.edited = 'just now';
    return structuredClone(section);
  }

  async deleteSection(sectionId: string) {
    const { store, page } = this.sectionOrThrow(sectionId);
    page.sections = page.sections.filter((s) => s.id !== sectionId);
    store.meta.edited = 'just now';
  }

  async reorderSections(pageId: string, sectionIds: string[]) {
    const { store, page } = this.findPage(pageId);
    const byId = new Map(page.sections.map((s) => [s.id, s]));
    page.sections = sectionIds.map((sid) => byId.get(sid)).filter(Boolean) as CmsEditorSection[];
    store.meta.edited = 'just now';
  }

  async setSectionVisibility(sectionId: string, visible: boolean) {
    const { store, section } = this.sectionOrThrow(sectionId);
    section.visible = visible;
    store.meta.edited = 'just now';
  }

  async listBlocks(sectionId: string) {
    return structuredClone(this.sectionOrThrow(sectionId).section.blocks);
  }

  async getBlock(blockId: string) {
    return structuredClone(this.blockOrThrow(blockId).block);
  }

  async createBlock(sectionId: string, input: Partial<CmsEditorBlock> & { type: string }) {
    const { store, section } = this.sectionOrThrow(sectionId);
    const block: CmsEditorBlock = {
      id: id('blk'),
      sectionId,
      type: input.type,
      visible: input.visible !== false,
      data: input.data || {},
      sortOrder: input.sortOrder ?? (section.blocks.length + 1) * 10,
    };
    section.blocks.push(block);
    store.meta.edited = 'just now';
    return structuredClone(block);
  }

  async updateBlock(blockId: string, patch: Partial<CmsEditorBlock>) {
    const { store, block } = this.blockOrThrow(blockId);
    Object.assign(block, patch, { id: block.id });
    store.meta.edited = 'just now';
    return structuredClone(block);
  }

  async deleteBlock(blockId: string) {
    const { store, section } = this.blockOrThrow(blockId);
    section.blocks = section.blocks.filter((b) => b.id !== blockId);
    store.meta.edited = 'just now';
  }

  async reorderBlocks(sectionId: string, blockIds: string[]) {
    const { store, section } = this.sectionOrThrow(sectionId);
    const byId = new Map(section.blocks.map((b) => [b.id, b]));
    section.blocks = blockIds
      .map((bid, index) => {
        const block = byId.get(bid);
        if (!block) return null;
        block.sortOrder = (index + 1) * 10;
        return block;
      })
      .filter(Boolean) as CmsEditorBlock[];
    store.meta.edited = 'just now';
  }

  private applyDraftPayload(siteId: string, pageId: string, payload: unknown) {
    const store = this.storeOrThrow(siteId);
    const page = store.pages.find((p) => p.id === pageId);
    if (!page || !payload || typeof payload !== 'object') return;
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.sections)) {
      page.sections = structuredClone(body.sections as CmsEditorSection[]);
    }
    if (body.theme && typeof body.theme === 'object') {
      store.meta.theme = structuredClone(body.theme as CmsSiteRecord['theme']);
    }
    if (body.schemas && typeof body.schemas === 'object') {
      store.meta.schemas = structuredClone(body.schemas as CmsSiteRecord['schemas']);
    }
  }

  async saveDraft(pageId: string, payload: unknown) {
    const { siteId, store, page } = this.findPage(pageId);
    this.applyDraftPayload(siteId, pageId, payload);
    const revision: CmsRevision = {
      id: id('rev'),
      pageId,
      kind: 'draft',
      createdAt: new Date().toISOString(),
      snapshot: structuredClone({ ...page, theme: store.meta.theme, schemas: store.meta.schemas }),
    };
    const list = store.revisions.get(pageId) || [];
    list.push(revision);
    store.revisions.set(pageId, list);
    store.meta.edited = 'just now';
    return structuredClone(revision);
  }

  async getRevision(revisionId: string) {
    for (const store of this.sites.values()) {
      for (const list of store.revisions.values()) {
        const hit = list.find((r) => r.id === revisionId);
        if (hit) return structuredClone(hit);
      }
    }
    throw new CmsCapabilityError('getRevision', `revision_not_found:${revisionId}`, 'cms_source_not_found');
  }

  async listRevisions(pageId: string) {
    const { store } = this.findPage(pageId);
    return structuredClone(store.revisions.get(pageId) || []);
  }

  async restoreRevision(pageId: string, revisionId: string) {
    const revision = await this.getRevision(revisionId);
    const { siteId, store } = this.findPage(pageId);
    const snap = revision.snapshot as CmsEditorPage & {
      theme?: CmsSiteRecord['theme'];
      schemas?: CmsSiteRecord['schemas'];
    };
    const idx = store.pages.findIndex((p) => p.id === pageId);
    if (idx < 0) throw new CmsCapabilityError('restoreRevision', `page_not_found:${pageId}`, 'cms_source_not_found');
    store.pages[idx] = structuredClone(snap);
    if (snap.theme) store.meta.theme = structuredClone(snap.theme);
    if (snap.schemas) store.meta.schemas = structuredClone(snap.schemas);
    store.meta.edited = 'just now';
    return structuredClone(store.pages[idx]);
  }

  async previewDraft(pageId: string) {
    const { page } = this.findPage(pageId);
    return { snapshot: structuredClone(page) };
  }

  async publish(pageId: string, options?: { revisionId?: string }) {
    const { siteId, store } = this.findPage(pageId);
    let page = store.pages.find((p) => p.id === pageId)!;
    if (options?.revisionId) {
      page = await this.restoreRevision(pageId, options.revisionId);
    }
    page.status = 'live';
    const snapshot: CmsPublicationSnapshot = {
      publicationId: id('pub'),
      route: page.slug,
      revision: (store.revisions.get(pageId)?.length || 0) + 1,
      theme: 'default',
      sections: page.sections.map((section) => ({
        type: section.type,
        props: { ...section.fields, name: section.name, blocks: section.blocks },
      })),
      publishedAt: new Date().toISOString(),
    };
    store.published.set(pageId, snapshot);
    const revision: CmsRevision = {
      id: id('rev'),
      pageId,
      kind: 'publication',
      createdAt: snapshot.publishedAt!,
      snapshot: structuredClone(page),
    };
    const list = store.revisions.get(pageId) || [];
    list.push(revision);
    store.revisions.set(pageId, list);
    store.meta.edited = 'just now';
    return structuredClone(snapshot);
  }

  async getPublishedRevision(pageId: string) {
    const { store } = this.findPage(pageId);
    const hit = store.published.get(pageId);
    return hit ? structuredClone(hit) : null;
  }

  async listAssets(siteId: string) {
    return structuredClone(this.storeOrThrow(siteId).assets);
  }

  async getAsset(assetId: string) {
    for (const store of this.sites.values()) {
      const hit = store.assets.find((a) => a.id === assetId);
      if (hit) return structuredClone(hit);
    }
    throw new CmsCapabilityError('getAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
  }

  async uploadAsset(siteId: string, file: Blob, meta?: { name?: string; metadata?: Record<string, unknown> }) {
    const store = this.storeOrThrow(siteId);
    const asset: CmsAsset = {
      id: id('asset'),
      name: meta?.name || 'upload',
      mimeType: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
      metadata: meta?.metadata,
    };
    store.assets.push(asset);
    store.meta.edited = 'just now';
    return structuredClone(asset);
  }

  async updateAsset(assetId: string, patch: Partial<Pick<CmsAsset, 'name' | 'metadata' | 'url' | 'key'>>) {
    for (const store of this.sites.values()) {
      const idx = store.assets.findIndex((a) => a.id === assetId);
      if (idx >= 0) {
        store.assets[idx] = { ...store.assets[idx], ...patch };
        store.meta.edited = 'just now';
        return structuredClone(store.assets[idx]);
      }
    }
    throw new CmsCapabilityError('getAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
  }

  async deleteAsset(assetId: string) {
    for (const store of this.sites.values()) {
      const before = store.assets.length;
      store.assets = store.assets.filter((a) => a.id !== assetId);
      if (store.assets.length !== before) {
        store.meta.edited = 'just now';
        return;
      }
    }
    throw new CmsCapabilityError('deleteAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
  }
}
