/**
 * HTTP CmsEditorAdapter — hosted Worker CMS authority via /api/cms/*.
 * Durable D1-backed persistence. Never an in-memory substitute.
 */

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

type Json = Record<string, any>;

function siteQuery(siteId: string) {
  return `site=${encodeURIComponent(siteId)}`;
}

async function api<T = Json>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || body?.detail || `HTTP ${response.status}`);
  }
  return body as T;
}

function parseFields(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as object) };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function mapStatus(row: Json): CmsEditorPage['status'] {
  const status = String(row.status || '').toLowerCase();
  if (status === 'live' || status === 'published' || row.published === 1 || row.published === true) {
    return 'live';
  }
  if (status === 'new') return 'new';
  return 'draft';
}

function mapZone(row: Json): CmsEditorSection['zone'] {
  const zone = String(row.zone || row.section_zone || '').toUpperCase();
  if (zone === 'HEADER' || zone === 'FOOTER' || zone === 'TEMPLATE') return zone;
  const type = String(row.section_type || row.type || '').toLowerCase();
  if (type.includes('header') || type.includes('nav')) return 'HEADER';
  if (type.includes('footer')) return 'FOOTER';
  return 'BODY';
}

function mapBlock(row: Json, sectionId: string): CmsEditorBlock {
  return {
    id: String(row.id),
    sectionId,
    type: String(row.block_type || row.component_type || row.type || 'text'),
    visible: row.is_visible !== 0 && row.is_visible !== false && row.visible !== false,
    data: parseFields(row.block_data ?? row.component_data ?? row.data),
    sortOrder: Number(row.sort_order || 0) || 0,
  };
}

function mapSection(row: Json, blocks: CmsEditorBlock[] = []): CmsEditorSection {
  const fields = parseFields(row.section_data ?? row.data ?? row.fields);
  const css = parseFields(fields.css_override ?? row.css);
  return {
    id: String(row.id),
    name: String(row.section_name || row.name || row.section_type || 'Section'),
    type: String(row.section_type || row.type || 'section'),
    zone: mapZone(row),
    visible: row.is_visible !== 0 && row.is_visible !== false && row.visible !== false,
    color: String(fields.color || row.color || '#111115'),
    fields,
    css,
    blocks,
  };
}

function mapPage(row: Json, sections: CmsEditorSection[] = []): CmsEditorPage {
  const slugRaw = String(row.slug || row.route_path || row.path || '/').trim() || '/';
  const slug = slugRaw.startsWith('/') ? slugRaw : `/${slugRaw}`;
  return {
    id: String(row.id),
    title: String(row.title || 'Untitled'),
    slug,
    status: mapStatus(row),
    type: String(row.page_type || row.type || 'Interior'),
    parent: row.parent_id ? String(row.parent_id) : undefined,
    sections,
    metaTitle: String(row.meta_title || row.title || ''),
    metaDescription: String(row.meta_description || ''),
  };
}

function initialsFrom(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CMS'
  );
}

function siteRecordFromBootstrap(siteId: string, boot: Json): CmsSiteRecord {
  const name = String(boot.tenant?.name || boot.workspace_label || siteId);
  return {
    id: siteId,
    name,
    initials: initialsFrom(name),
    domain: String(boot.tenant?.domain || boot.public_domain || ''),
    edited: 'synced',
    color: String(boot.tenant?.primary_color || '#1e6a6f'),
    theme: {
      cssVars: parseFields(boot.active_theme?.css_vars || {}),
    },
    schemas: boot.schemas
      ? {
          protocol_version: Number(boot.schemas.protocol_version || 1),
          sections: Array.isArray(boot.schemas.sections) ? boot.schemas.sections : [],
          blocks: Array.isArray(boot.schemas.blocks) ? boot.schemas.blocks : [],
        }
      : undefined,
  };
}

function hydratePages(boot: Json): CmsEditorPage[] {
  const pages = Array.isArray(boot.pages) ? boot.pages : [];
  const sectionsByPage = boot.sections_by_page || {};
  const blocksBySection = boot.blocks_by_section || boot.components_by_section || {};

  return pages.map((pageRow: Json) => {
    const sectionRows = Array.isArray(sectionsByPage[pageRow.id])
      ? sectionsByPage[pageRow.id]
      : [];
    const sections = sectionRows.map((sectionRow: Json) => {
      const blockRows = Array.isArray(blocksBySection[sectionRow.id])
        ? blocksBySection[sectionRow.id]
        : [];
      return mapSection(
        sectionRow,
        blockRows.map((blockRow: Json) => mapBlock(blockRow, String(sectionRow.id))),
      );
    });
    return mapPage(pageRow, sections);
  });
}

/**
 * Hosted HTTP adapter bound to Worker `/api/cms/*` for a single site id (project_slug).
 */
export class HttpCmsAdapter implements CmsEditorAdapter {
  readonly temporary = false;
  private readonly base: string;
  private readonly knownSites: Map<string, CmsSiteRecord>;

  constructor(
    options: {
      base?: string;
      sites?: Array<{ id?: string; slug?: string; name?: string; domain?: string }>;
    } = {},
  ) {
    this.base = String(options.base || '').replace(/\/$/, '');
    this.knownSites = new Map();
    for (const site of options.sites || []) {
      const id = String(site.id || site.slug || '').trim();
      if (!id) continue;
      const name = String(site.name || id);
      this.knownSites.set(id, {
        id,
        name,
        initials: initialsFrom(name),
        domain: String(site.domain || ''),
        edited: 'catalog',
        color: '#1e6a6f',
      });
    }
  }

  private url(path: string) {
    return `${this.base}${path}`;
  }

  async listSites(): Promise<CmsSiteRecord[]> {
    if (this.knownSites.size) return [...this.knownSites.values()].map((s) => structuredClone(s));
    // Fallback: bootstrap the default studio site so hub/editor share one authority.
    const boot = await api<Json>(this.url(`/api/cms/bootstrap?${siteQuery('agentsam-sdk')}`));
    const record = siteRecordFromBootstrap('agentsam-sdk', boot);
    this.knownSites.set(record.id, record);
    return [structuredClone(record)];
  }

  async getSite(siteId: string): Promise<CmsSiteRecord> {
    const boot = await api<Json>(this.url(`/api/cms/bootstrap?${siteQuery(siteId)}`));
    const record = siteRecordFromBootstrap(siteId, boot);
    this.knownSites.set(siteId, record);
    return structuredClone(record);
  }

  async createSite(_input: CmsSiteCreateInput): Promise<CmsSiteRecord> {
    throw new CmsCapabilityError(
      'createSite',
      'Hosted site creation uses the deploy wizard / projects API — not inline CMS create yet.',
      'cms_capability_unsupported',
    );
  }

  async updateSite(siteId: string, patch: CmsSiteUpdatePatch): Promise<CmsSiteRecord> {
    const current = await this.getSite(siteId);
    if (patch.theme?.cssVars) {
      await api(this.url(`/api/cms/theme-vars?${siteQuery(siteId)}`), {
        method: 'PATCH',
        body: JSON.stringify({ project_slug: siteId, vars: patch.theme.cssVars }),
      });
    }
    const next = { ...current, ...patch, id: siteId, edited: 'just now' };
    this.knownSites.set(siteId, next);
    return structuredClone(next);
  }

  async deleteSite(_siteId: string): Promise<void> {
    throw new CmsCapabilityError('deleteSite', 'Hosted site delete is not enabled', 'cms_capability_unsupported');
  }

  async loadSite(siteId: string): Promise<CmsEditorSite> {
    const boot = await api<Json>(this.url(`/api/cms/bootstrap?${siteQuery(siteId)}`));
    const meta = siteRecordFromBootstrap(siteId, boot);
    this.knownSites.set(siteId, meta);
    return {
      ...meta,
      pages: hydratePages(boot),
    };
  }

  async listPages(siteId: string): Promise<CmsEditorPage[]> {
    const site = await this.loadSite(siteId);
    return site.pages;
  }

  async getPage(pageId: string): Promise<CmsEditorPage> {
    // Worker page GET requires site slug — resolve via known sites / bootstrap scan.
    for (const siteId of this.knownSites.keys()) {
      try {
        const body = await api<Json>(
          this.url(`/api/cms/pages/${encodeURIComponent(pageId)}?${siteQuery(siteId)}`),
        );
        const sections = Array.isArray(body.sections)
          ? body.sections.map((row: Json) => mapSection(row, []))
          : [];
        // Hydrate blocks via bootstrap for completeness when section list is bare.
        if (!sections.some((s) => s.blocks.length)) {
          const full = await this.loadSite(siteId);
          const hit = full.pages.find((p) => p.id === pageId);
          if (hit) return structuredClone(hit);
        }
        return mapPage(body.page || { id: pageId }, sections);
      } catch {
        // try next site
      }
    }
    // Last resort: agentsam-sdk
    const full = await this.loadSite('agentsam-sdk');
    const hit = full.pages.find((p) => p.id === pageId);
    if (!hit) {
      throw new CmsCapabilityError('getPage', `page_not_found:${pageId}`, 'cms_source_not_found');
    }
    return structuredClone(hit);
  }

  async createPage(
    siteId: string,
    input: Partial<CmsEditorPage> & { title: string; slug: string },
  ): Promise<CmsEditorPage> {
    const slug = input.slug.replace(/^\/+/, '');
    const body = await api<Json>(this.url(`/api/cms/pages?${siteQuery(siteId)}`), {
      method: 'POST',
      body: JSON.stringify({
        project_id: siteId,
        project_slug: siteId,
        title: input.title || 'Untitled',
        slug,
        route_path: `/${slug}`,
        page_type: input.type || 'interior',
        status: 'draft',
      }),
    });
    return mapPage(body.page || body, []);
  }

  async updatePage(pageId: string, patch: Partial<CmsEditorPage>): Promise<CmsEditorPage> {
    const siteId = await this.findPageSiteId(pageId);
    const body = await api<Json>(
      this.url(`/api/cms/pages/${encodeURIComponent(pageId)}?${siteQuery(siteId)}`),
      {
        method: 'PUT',
        body: JSON.stringify({
          title: patch.title,
          slug: patch.slug?.replace(/^\/+/, ''),
          route_path: patch.slug,
          page_type: patch.type,
          status: patch.status,
          meta_title: patch.metaTitle,
          meta_description: patch.metaDescription,
        }),
      },
    );
    return mapPage(body.page || body, patch.sections || []);
  }

  async deletePage(_pageId: string): Promise<void> {
    throw new CmsCapabilityError('deletePage', 'Hosted page delete not enabled yet', 'cms_capability_unsupported');
  }

  async listSections(pageId: string): Promise<CmsEditorSection[]> {
    const page = await this.getPage(pageId);
    return page.sections;
  }

  async getSection(sectionId: string): Promise<CmsEditorSection> {
    const site = await this.loadSite(await this.guessSiteId());
    for (const page of site.pages) {
      const section = page.sections.find((s) => s.id === sectionId);
      if (section) return structuredClone(section);
    }
    throw new CmsCapabilityError('getSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
  }

  async createSection(
    pageId: string,
    input: Partial<CmsEditorSection> & { name: string },
  ): Promise<CmsEditorSection> {
    const siteId = await this.findPageSiteId(pageId);
    const body = await api<Json>(this.url(`/api/cms/sections?${siteQuery(siteId)}`), {
      method: 'POST',
      body: JSON.stringify({
        page_id: pageId,
        section_type: input.type || 'section',
        section_name: input.name,
        section_data: input.fields || {},
        sort_order: 0,
      }),
    });
    return mapSection(body.section || body, []);
  }

  async updateSection(
    sectionId: string,
    patch: Partial<CmsEditorSection>,
  ): Promise<CmsEditorSection> {
    const siteId = await this.guessSiteId();
    const body = await api<Json>(
      this.url(`/api/cms/sections/${encodeURIComponent(sectionId)}?${siteQuery(siteId)}`),
      {
        method: 'PUT',
        body: JSON.stringify({
          section_name: patch.name,
          section_data: patch.fields,
          css: patch.css,
          is_visible: patch.visible === false ? 0 : 1,
        }),
      },
    );
    return mapSection(body.section || body, patch.blocks || []);
  }

  async deleteSection(_sectionId: string): Promise<void> {
    throw new CmsCapabilityError('deleteSection', 'Hosted section delete not enabled yet', 'cms_capability_unsupported');
  }

  async reorderSections(pageId: string, sectionIds: string[]): Promise<void> {
    const siteId = await this.findPageSiteId(pageId);
    await api(this.url(`/api/cms/sections/reorder?${siteQuery(siteId)}`), {
      method: 'POST',
      body: JSON.stringify({
        page_id: pageId,
        order: sectionIds.map((id, index) => ({ id, sort_order: (index + 1) * 10 })),
      }),
    });
  }

  async setSectionVisibility(sectionId: string, visible: boolean): Promise<void> {
    const siteId = await this.guessSiteId();
    await api(
      this.url(`/api/cms/sections/${encodeURIComponent(sectionId)}/visibility?${siteQuery(siteId)}`),
      {
        method: 'POST',
        body: JSON.stringify({ is_visible: visible ? 1 : 0 }),
      },
    );
  }

  async listBlocks(sectionId: string): Promise<CmsEditorBlock[]> {
    const section = await this.getSection(sectionId);
    return section.blocks;
  }

  async getBlock(blockId: string): Promise<CmsEditorBlock> {
    const site = await this.loadSite(await this.guessSiteId());
    for (const page of site.pages) {
      for (const section of page.sections) {
        const block = section.blocks.find((b) => b.id === blockId);
        if (block) return structuredClone(block);
      }
    }
    throw new CmsCapabilityError('getBlock', `block_not_found:${blockId}`, 'cms_source_not_found');
  }

  async createBlock(
    sectionId: string,
    input: Partial<CmsEditorBlock> & { type: string },
  ): Promise<CmsEditorBlock> {
    const siteId = await this.guessSiteId();
    const body = await api<Json>(this.url(`/api/cms/blocks?${siteQuery(siteId)}`), {
      method: 'POST',
      body: JSON.stringify({
        section_id: sectionId,
        block_type: input.type,
        type: input.type,
        block_data: input.data || {},
        sort_order: input.sortOrder ?? 10,
      }),
    });
    return mapBlock(body.block || body.component || body, sectionId);
  }

  async updateBlock(blockId: string, patch: Partial<CmsEditorBlock>): Promise<CmsEditorBlock> {
    const siteId = await this.guessSiteId();
    const body = await api<Json>(
      this.url(`/api/cms/blocks/${encodeURIComponent(blockId)}?${siteQuery(siteId)}`),
      {
        method: 'PUT',
        body: JSON.stringify({
          block_data: patch.data,
          block_type: patch.type,
          type: patch.type,
        }),
      },
    );
    return mapBlock(body.block || body.component || { id: blockId, ...patch }, patch.sectionId || '');
  }

  async deleteBlock(_blockId: string): Promise<void> {
    throw new CmsCapabilityError('deleteBlock', 'Hosted block delete not enabled yet', 'cms_capability_unsupported');
  }

  async saveDraft(pageId: string, payload: unknown): Promise<CmsRevision> {
    const siteId = await this.findPageSiteId(pageId);
    const body = payload as { sections?: CmsEditorSection[] };
    if (Array.isArray(body?.sections)) {
      for (const section of body.sections) {
        await api(this.url(`/api/cms/sections/${encodeURIComponent(section.id)}?${siteQuery(siteId)}`), {
          method: 'PUT',
          body: JSON.stringify({
            section_name: section.name,
            section_data: section.fields || {},
            css: section.css || {},
            is_visible: section.visible === false ? 0 : 1,
          }),
        });
      }
    }
    // Mark page draft
    await api(this.url(`/api/cms/pages/${encodeURIComponent(pageId)}?${siteQuery(siteId)}`), {
      method: 'PUT',
      body: JSON.stringify({ status: 'draft' }),
    });
    return {
      id: `rev_${Date.now()}`,
      pageId,
      kind: 'draft',
      createdAt: new Date().toISOString(),
      snapshot: payload,
    };
  }

  async getRevision(_revisionId: string): Promise<CmsRevision> {
    throw new CmsCapabilityError('getRevision', 'revision history API not wired yet', 'cms_capability_unsupported');
  }

  async listRevisions(_pageId: string): Promise<CmsRevision[]> {
    return [];
  }

  async restoreRevision(_pageId: string, _revisionId: string): Promise<CmsEditorPage> {
    throw new CmsCapabilityError('restoreRevision', 'revision restore not wired yet', 'cms_capability_unsupported');
  }

  async previewDraft(pageId: string): Promise<{ previewUrl?: string; snapshot: unknown }> {
    const siteId = await this.findPageSiteId(pageId);
    const page = await this.getPage(pageId);
    return {
      previewUrl: `/api/cms/render-page?${siteQuery(siteId)}&page_id=${encodeURIComponent(pageId)}&mode=draft`,
      snapshot: page,
    };
  }

  async publish(pageId: string): Promise<CmsPublicationSnapshot> {
    const siteId = await this.findPageSiteId(pageId);
    const body = await api<Json>(
      this.url(`/api/cms/pages/${encodeURIComponent(pageId)}/publish?${siteQuery(siteId)}`),
      { method: 'POST', body: JSON.stringify({}) },
    );
    const page = mapPage(body.page || { id: pageId, slug: '/' }, []);
    return {
      publicationId: `pub_${pageId}`,
      route: page.slug,
      revision: 1,
      theme: 'default',
      sections: [],
      publishedAt: new Date().toISOString(),
    };
  }

  async getPublishedRevision(pageId: string): Promise<CmsPublicationSnapshot | null> {
    try {
      const page = await this.getPage(pageId);
      if (page.status !== 'live') return null;
      return {
        publicationId: `pub_${pageId}`,
        route: page.slug,
        revision: 1,
        theme: 'default',
        sections: page.sections.map((section) => ({
          type: section.type,
          props: { ...section.fields, name: section.name, blocks: section.blocks },
        })),
        publishedAt: undefined,
      };
    } catch {
      return null;
    }
  }

  async listAssets(siteId: string): Promise<CmsAsset[]> {
    const body = await api<Json>(this.url(`/api/cms/assets?${siteQuery(siteId)}`));
    return (body.assets || []).map((row: Json) => ({
      id: String(row.id),
      name: String(row.original_filename || row.filename || row.id),
      mimeType: row.mime_type ? String(row.mime_type) : undefined,
      size: row.content_size_bytes != null ? Number(row.content_size_bytes) : undefined,
      url: row.public_url ? String(row.public_url) : undefined,
      key: String(row.id),
    }));
  }

  async getAsset(assetId: string): Promise<CmsAsset> {
    for (const siteId of this.knownSites.keys()) {
      const assets = await this.listAssets(siteId);
      const hit = assets.find((a) => a.id === assetId);
      if (hit) return hit;
    }
    throw new CmsCapabilityError('getAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
  }

  async uploadAsset(
    _siteId: string,
    _file: Blob,
    _meta?: { name?: string; metadata?: Record<string, unknown> },
  ): Promise<CmsAsset> {
    throw new CmsCapabilityError('uploadAsset', 'Hosted asset upload uses Media studio', 'cms_capability_unsupported');
  }

  async updateAsset(
    _assetId: string,
    _patch: Partial<Pick<CmsAsset, 'name' | 'metadata' | 'url' | 'key'>>,
  ): Promise<CmsAsset> {
    throw new CmsCapabilityError('updateAsset', 'Hosted asset update not enabled', 'cms_capability_unsupported');
  }

  async deleteAsset(_assetId: string): Promise<void> {
    throw new CmsCapabilityError('deleteAsset', 'Hosted asset delete not enabled', 'cms_capability_unsupported');
  }

  private guessSiteId() {
    const first = this.knownSites.keys().next().value;
    return first || 'agentsam-sdk';
  }

  private async findPageSiteId(pageId: string): Promise<string> {
    if (!this.knownSites.size) {
      await this.listSites();
    }
    for (const siteId of this.knownSites.keys()) {
      try {
        const site = await this.loadSite(siteId);
        if (site.pages.some((p) => p.id === pageId)) return siteId;
      } catch {
        // continue
      }
    }
    return this.guessSiteId();
  }
}

export function createHttpCmsAdapter(
  options?: ConstructorParameters<typeof HttpCmsAdapter>[0],
): HttpCmsAdapter {
  return new HttpCmsAdapter(options);
}
