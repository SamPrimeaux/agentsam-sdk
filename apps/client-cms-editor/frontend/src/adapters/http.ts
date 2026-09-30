import {
  CmsCapabilityError,
  mapCmsEditorBlock,
  mapCmsEditorBootstrap,
  mapCmsEditorPage,
  mapCmsEditorSection,
  type CmsAsset,
  type CmsEditorAdapter,
  type CmsEditorBlock,
  type CmsEditorPage,
  type CmsEditorSection,
  type CmsEditorSite,
  type CmsPublicationSnapshot,
  type CmsRevision,
  type CmsSiteCreateInput,
  type CmsSiteRecord,
  type CmsSiteUpdatePatch,
} from '@inneranimalmedia/agentsam-cms-shared';

export type CmsHttpRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

export type CmsHttpTransport = (request: CmsHttpRequest) => Promise<unknown>;

type Json = Record<string, any>;

async function browserTransport(request: CmsHttpRequest): Promise<unknown> {
  const response = await fetch(request.path, {
    method: request.method || 'GET',
    headers: request.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const data = payload && typeof payload === 'object' ? payload as Json : {};
    throw Object.assign(
      new Error(String(data.message || data.error || response.statusText || 'CMS request failed')),
      { status: response.status, payload },
    );
  }
  return payload;
}

function unsupported(capability: string): never {
  throw new CmsCapabilityError(
    capability,
    'HTTP CMS host does not expose ' + capability + ' yet',
  );
}

function withoutPages(site: CmsEditorSite): CmsSiteRecord {
  const { pages: _pages, ...record } = site;
  return record;
}

function publicationFromPage(page: CmsEditorPage, siteId: string): CmsPublicationSnapshot {
  return {
    publicationId: 'http:' + siteId + ':' + page.id,
    route: page.slug,
    revision: 1,
    theme: 'site',
    sections: page.sections.map((section) => ({
      id: section.id,
      type: section.type,
      props: {
        ...section.fields,
        name: section.name,
        blocks: section.blocks,
      },
    })),
    metadata: { source: 'http', siteId, status: page.status },
  };
}

export class HttpCmsAdapter implements CmsEditorAdapter {
  readonly siteId: string;
  readonly transport: CmsHttpTransport;

  constructor(options: { siteId: string; transport?: CmsHttpTransport }) {
    this.siteId = options.siteId;
    this.transport = options.transport || browserTransport;
  }

  private async request<T = Json>(request: CmsHttpRequest): Promise<T> {
    return await this.transport(request) as T;
  }

  private assertSite(siteId: string) {
    if (siteId !== this.siteId) {
      throw new CmsCapabilityError(
        'site',
        'CMS adapter is scoped to ' + this.siteId + ', not ' + siteId,
        'cms_source_not_found',
      );
    }
  }

  async listSites() {
    return [withoutPages(await this.loadSite(this.siteId))];
  }

  async getSite(siteId: string) {
    return withoutPages(await this.loadSite(siteId));
  }

  async createSite(_input: CmsSiteCreateInput) {
    return unsupported('createSite');
  }

  async updateSite(_siteId: string, _patch: CmsSiteUpdatePatch) {
    return unsupported('updateSite');
  }

  async deleteSite(_siteId: string) {
    return unsupported('deleteSite');
  }

  async loadSite(siteId: string) {
    this.assertSite(siteId);
    const params = new URLSearchParams({ project_slug: siteId, site: siteId });
    const raw = await this.request<Json>({
      path: '/api/cms/bootstrap?' + params.toString(),
    });
    const mapped = mapCmsEditorBootstrap(raw, siteId);
    return {
      ...mapped.site,
      theme: { cssVars: mapped.themeVars },
      schemas: mapped.schemas,
    };
  }

  async listPages(siteId: string) {
    return (await this.loadSite(siteId)).pages;
  }

  async getPage(pageId: string) {
    const page = (await this.loadSite(this.siteId)).pages.find((item) => item.id === pageId);
    if (!page) {
      throw new CmsCapabilityError('getPage', 'page_not_found:' + pageId, 'cms_source_not_found');
    }
    return page;
  }

  async createPage(siteId: string, input: Partial<CmsEditorPage> & { title: string; slug: string }) {
    this.assertSite(siteId);
    const slug = input.slug.replace(/^\/+/, '') || 'untitled';
    const result = await this.request<Json>({
      method: 'POST',
      path: '/api/cms/pages',
      body: {
        project_id: siteId,
        title: input.title,
        slug,
        route_path: '/' + slug,
        page_type: input.type || 'interior',
        status: 'draft',
        content: '',
      },
    });
    return mapCmsEditorPage(result.page || result);
  }

  async updatePage(pageId: string, patch: Partial<CmsEditorPage>) {
    const current = await this.getPage(pageId);
    const page = { ...current, ...patch, id: pageId };
    const normalizedRoute = page.slug === '/' ? '/' : '/' + String(page.slug || '').replace(/^\/+|\/+$/g, '');
    await this.request({
      method: 'PUT',
      path: '/api/cms/pages/' + encodeURIComponent(pageId),
      body: {
        title: page.title,
        route_path: normalizedRoute,
        slug: normalizedRoute === '/' ? 'home' : normalizedRoute.slice(1),
        page_type: page.type,
        seo_title: page.metaTitle,
        meta_description: page.metaDescription,
      },
    });
    return await this.getPage(pageId);
  }

  async deletePage(_pageId: string) {
    return unsupported('deletePage');
  }

  async listSections(pageId: string) {
    return (await this.getPage(pageId)).sections;
  }

  async getSection(sectionId: string) {
    for (const page of (await this.loadSite(this.siteId)).pages) {
      const section = page.sections.find((item) => item.id === sectionId);
      if (section) return section;
    }
    throw new CmsCapabilityError('getSection', 'section_not_found:' + sectionId, 'cms_source_not_found');
  }

  async createSection(pageId: string, input: Partial<CmsEditorSection> & { name: string }) {
    const result = await this.request<Json>({
      method: 'POST',
      path: '/api/cms/sections',
      body: {
        page_id: pageId,
        section_type: input.type || input.name.toLowerCase().replace(/\s+/g, '-'),
        section_name: input.name,
        section_data: input.fields || {},
        sort_order: ((await this.listSections(pageId)).length + 1) * 10,
      },
    });
    return mapCmsEditorSection(result.section || result);
  }

  async updateSection(sectionId: string, patch: Partial<CmsEditorSection>) {
    const current = await this.getSection(sectionId);
    const section = { ...current, ...patch, id: sectionId };
    await this.request({
      method: 'PUT',
      path: '/api/cms/sections/' + encodeURIComponent(sectionId),
      body: {
        section_name: section.name,
        section_type: section.type,
        section_data: {
          ...section.fields,
          ...(section.css && Object.keys(section.css).length ? { css_override: section.css } : {}),
        },
      },
    });
    if (patch.visible !== undefined && patch.visible !== current.visible) {
      await this.setSectionVisibility(sectionId, patch.visible);
    }
    return await this.getSection(sectionId);
  }

  async deleteSection(_sectionId: string) {
    return unsupported('deleteSection');
  }

  async reorderSections(pageId: string, sectionIds: string[]) {
    await this.request({
      method: 'POST',
      path: '/api/cms/sections/reorder',
      body: {
        page_id: pageId,
        order: sectionIds.map((id, index) => ({ id, sort_order: (index + 1) * 10 })),
      },
    });
  }

  async setSectionVisibility(sectionId: string, visible: boolean) {
    await this.request({
      method: 'POST',
      path: '/api/cms/sections/' + encodeURIComponent(sectionId) + '/visibility',
      body: { is_visible: visible ? 1 : 0 },
    });
  }

  async listBlocks(sectionId: string) {
    const result = await this.request<Json>({
      path: '/api/cms/blocks?section_id=' + encodeURIComponent(sectionId),
    });
    return (result.blocks || result.components || []).map((row: Json) => mapCmsEditorBlock(row, sectionId));
  }

  async getBlock(blockId: string) {
    for (const page of (await this.loadSite(this.siteId)).pages) {
      for (const section of page.sections) {
        const block = section.blocks.find((item) => item.id === blockId);
        if (block) return block;
      }
    }
    throw new CmsCapabilityError('getBlock', 'block_not_found:' + blockId, 'cms_source_not_found');
  }

  async createBlock(sectionId: string, input: Partial<CmsEditorBlock> & { type: string }) {
    const result = await this.request<Json>({
      method: 'POST',
      path: '/api/cms/blocks',
      body: {
        section_id: sectionId,
        type: input.type,
        block_type: input.type,
        component_type: input.type,
        data: input.data || {},
        sort_order: input.sortOrder || ((await this.listBlocks(sectionId)).length + 1) * 10,
      },
    });
    return mapCmsEditorBlock(result.block || result.component || result, sectionId);
  }

  async updateBlock(blockId: string, patch: Partial<CmsEditorBlock>) {
    const current = await this.getBlock(blockId);
    const block = { ...current, ...patch, id: blockId };
    await this.request({
      method: 'PUT',
      path: '/api/cms/blocks/' + encodeURIComponent(blockId),
      body: {
        block_data: block.data,
        block_type: block.type,
        type: block.type,
        component_type: block.type,
      },
    });
    if (patch.visible !== undefined && patch.visible !== current.visible) {
      await this.request({
        method: 'POST',
        path: '/api/cms/blocks/' + encodeURIComponent(blockId) + '/visibility',
        body: { is_visible: patch.visible ? 1 : 0 },
      });
    }
    return await this.getBlock(blockId);
  }

  async deleteBlock(_blockId: string) {
    return unsupported('deleteBlock');
  }

  async reorderBlocks(sectionId: string, blockIds: string[]) {
    await this.request({
      method: 'POST',
      path: '/api/cms/blocks/reorder',
      body: {
        section_id: sectionId,
        order: blockIds.map((id, index) => ({ id, sort_order: (index + 1) * 10 })),
      },
    });
  }

  async saveDraft(pageId: string, payload: unknown): Promise<CmsRevision> {
    const data = payload && typeof payload === 'object' ? payload as { sections?: CmsEditorSection[] } : {};
    const sections = Array.isArray(data.sections) ? data.sections : [];

    for (const section of sections) {
      await this.updateSection(section.id, section);
      for (const block of section.blocks || []) {
        await this.updateBlock(block.id, block);
      }
      if (section.blocks?.length) {
        await this.reorderBlocks(section.id, section.blocks.map((block) => block.id));
      }
    }
    if (sections.length) {
      await this.reorderSections(pageId, sections.map((section) => section.id));
    }

    const page = await this.getPage(pageId);
    return {
      id: 'http-draft:' + pageId + ':' + Date.now(),
      pageId,
      kind: 'draft',
      createdAt: new Date().toISOString(),
      snapshot: page,
    };
  }

  async getRevision(_revisionId: string) {
    return unsupported('getRevision');
  }

  async listRevisions(_pageId: string) {
    return unsupported('listRevisions');
  }

  async restoreRevision(_pageId: string, _revisionId: string) {
    return unsupported('restoreRevision');
  }

  async previewDraft(pageId: string) {
    return {
      previewUrl: '/api/cms/render-page?page_id=' + encodeURIComponent(pageId) + '&mode=draft',
      snapshot: await this.getPage(pageId),
    };
  }

  async publish(pageId: string, _options?: { revisionId?: string }) {
    await this.request({
      method: 'POST',
      path: '/api/cms/pages/' + encodeURIComponent(pageId) + '/publish',
      body: {},
    });
    return publicationFromPage(await this.getPage(pageId), this.siteId);
  }

  async getPublishedRevision(pageId: string) {
    const page = await this.getPage(pageId);
    return page.status === 'live' ? publicationFromPage(page, this.siteId) : null;
  }

  async listAssets(_siteId: string): Promise<CmsAsset[]> {
    const result = await this.request<Json>({ path: '/api/cms/assets' });
    return (result.assets || []).map((asset: Json, index: number) => ({
      id: String(asset.id ?? index),
      name: String(asset.original_filename || asset.filename || asset.label || 'Asset'),
      mimeType: asset.mime_type ? String(asset.mime_type) : undefined,
      size: asset.content_size_bytes === undefined ? undefined : Number(asset.content_size_bytes),
      url: asset.thumbnail_url || asset.cdn_url || asset.public_url || undefined,
      key: asset.r2_key || asset.key || undefined,
      createdAt: asset.created_at ? String(asset.created_at) : undefined,
      metadata: asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : undefined,
    }));
  }

  async getAsset(assetId: string) {
    const asset = (await this.listAssets(this.siteId)).find((item) => item.id === assetId);
    if (!asset) throw new CmsCapabilityError('getAsset', 'asset_not_found:' + assetId, 'cms_source_not_found');
    return asset;
  }

  async uploadAsset(_siteId: string, _file: Blob, _meta?: { name?: string; metadata?: Record<string, unknown> }) {
    return unsupported('uploadAsset');
  }

  async updateAsset(_assetId: string, _patch: Partial<Pick<CmsAsset, 'name' | 'metadata' | 'url' | 'key'>>) {
    return unsupported('updateAsset');
  }

  async deleteAsset(_assetId: string) {
    return unsupported('deleteAsset');
  }
}

export function createHttpCmsAdapter(options: { siteId: string; transport?: CmsHttpTransport }) {
  return new HttpCmsAdapter(options);
}
