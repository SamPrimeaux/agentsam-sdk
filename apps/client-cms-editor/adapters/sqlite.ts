/**
 * Node-only local persistence adapter (`@inneranimalmedia/client-cms-editor/sqlite-adapter`).
 *
 * Requires a Node.js runtime with built-in `node:sqlite` (Node 22+ today). This subpath is not
 * browser-safe and is intentionally separate from the root `./` editor bundle.
 */
import { DatabaseSync } from 'node:sqlite';
import {
  CmsCapabilityError,
  type CmsAsset,
  type CmsEditorAdapter,
  type CmsPublicationSnapshot,
  type CmsRevision,
} from '../shared/cms/src/adapter';
import type {
  CmsEditorBlock,
  CmsEditorPage,
  CmsEditorSection,
  CmsEditorSite,
  CmsSiteCreateInput,
  CmsSiteRecord,
  CmsSiteUpdatePatch,
} from '../shared/cms/src/editor-types';

/** Documented runtime requirement for the sqlite-adapter export (Node + node:sqlite). */
export const SQLITE_ADAPTER_NODE_RUNTIME = 'node:sqlite' as const;

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function siteInitials(name: string) {
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

function rowToSiteRecord(row: Record<string, unknown>): CmsSiteRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    initials: String(row.initials),
    domain: String(row.domain ?? ''),
    edited: String(row.edited ?? 'just now'),
    color: String(row.color ?? '#1e6a6f'),
    theme: parseJson(row.theme_json as string, undefined),
    schemas: parseJson(row.schemas_json as string, undefined),
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cms_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  edited TEXT NOT NULL DEFAULT 'just now',
  color TEXT NOT NULL DEFAULT '#1e6a6f',
  theme_json TEXT,
  schemas_json TEXT
);
CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES cms_sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  type TEXT NOT NULL DEFAULT 'Interior',
  parent TEXT,
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cms_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'BODY',
  visible INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#111115',
  fields_json TEXT NOT NULL DEFAULT '{}',
  css_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cms_blocks (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES cms_sections(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 10
);
CREATE TABLE IF NOT EXISTS cms_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT,
  snapshot_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_publications (
  page_id TEXT PRIMARY KEY REFERENCES cms_pages(id) ON DELETE CASCADE,
  publication_id TEXT NOT NULL,
  route TEXT NOT NULL,
  revision_num INTEGER NOT NULL,
  theme TEXT NOT NULL DEFAULT 'default',
  sections_json TEXT NOT NULL,
  published_at TEXT,
  metadata_json TEXT
);
CREATE TABLE IF NOT EXISTS cms_assets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES cms_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  url TEXT,
  asset_key TEXT,
  created_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_cms_pages_site ON cms_pages(site_id);
CREATE INDEX IF NOT EXISTS idx_cms_sections_page ON cms_sections(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_blocks_section ON cms_blocks(section_id);
CREATE INDEX IF NOT EXISTS idx_cms_revisions_page ON cms_revisions(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_assets_site ON cms_assets(site_id);
`;

/**
 * File-backed SQLite adapter (Node node:sqlite). Durable local authority for desktop/offline hosts.
 */
export class SqliteCmsAdapter implements CmsEditorAdapter {
  readonly temporary = false;
  private db: DatabaseSync;
  readonly dbPath: string;

  constructor(dbPath: string, options?: { readonly?: boolean }) {
    this.dbPath = dbPath;
    this.db = options?.readonly ? new DatabaseSync(dbPath, { readOnly: true }) : new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (!options?.readonly) {
      this.db.exec(SCHEMA_SQL);
    }
  }

  close() {
    this.db.close();
  }

  private siteRow(siteId: string) {
    const row = this.db.prepare('SELECT * FROM cms_sites WHERE id = ?').get(siteId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('getSite', `site_not_found:${siteId}`, 'cms_source_not_found');
    }
    return row;
  }

  private hydratePage(pageId: string): CmsEditorPage {
    const pageRow = this.db.prepare('SELECT * FROM cms_pages WHERE id = ?').get(pageId) as
      | Record<string, unknown>
      | undefined;
    if (!pageRow) {
      throw new CmsCapabilityError('getPage', `page_not_found:${pageId}`, 'cms_source_not_found');
    }
    const sectionRows = this.db
      .prepare('SELECT * FROM cms_sections WHERE page_id = ? ORDER BY sort_order ASC')
      .all(pageId) as Record<string, unknown>[];
    const sections: CmsEditorSection[] = sectionRows.map((sectionRow) => {
      const sectionId = String(sectionRow.id);
      const blockRows = this.db
        .prepare('SELECT * FROM cms_blocks WHERE section_id = ? ORDER BY sort_order ASC')
        .all(sectionId) as Record<string, unknown>[];
      return {
        id: sectionId,
        name: String(sectionRow.name),
        type: String(sectionRow.type),
        zone: String(sectionRow.zone) as CmsEditorSection['zone'],
        visible: Number(sectionRow.visible) !== 0,
        color: String(sectionRow.color),
        fields: parseJson(String(sectionRow.fields_json), {}),
        css: parseJson(String(sectionRow.css_json), {}),
        blocks: blockRows.map(
          (blockRow): CmsEditorBlock => ({
            id: String(blockRow.id),
            sectionId,
            type: String(blockRow.type),
            visible: Number(blockRow.visible) !== 0,
            data: parseJson(String(blockRow.data_json), {}),
            sortOrder: Number(blockRow.sort_order),
          }),
        ),
      };
    });
    return {
      id: String(pageRow.id),
      title: String(pageRow.title),
      slug: String(pageRow.slug),
      status: String(pageRow.status) as CmsEditorPage['status'],
      type: String(pageRow.type),
      parent: pageRow.parent ? String(pageRow.parent) : undefined,
      sections,
      metaTitle: String(pageRow.meta_title),
      metaDescription: String(pageRow.meta_description),
    };
  }

  private findPageSiteId(pageId: string): string {
    const row = this.db.prepare('SELECT site_id FROM cms_pages WHERE id = ?').get(pageId) as
      | { site_id: string }
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('getPage', `page_not_found:${pageId}`, 'cms_source_not_found');
    }
    return String(row.site_id);
  }

  async listSites(): Promise<CmsSiteRecord[]> {
    const rows = this.db.prepare('SELECT * FROM cms_sites ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map(rowToSiteRecord);
  }

  async getSite(siteId: string): Promise<CmsSiteRecord> {
    return rowToSiteRecord(this.siteRow(siteId));
  }

  async createSite(input: CmsSiteCreateInput): Promise<CmsSiteRecord> {
    const siteId = String(input.id || id('site')).trim();
    if (!siteId) throw new Error('cms_site_id_required');
    const exists = this.db.prepare('SELECT id FROM cms_sites WHERE id = ?').get(siteId);
    if (exists) {
      throw new CmsCapabilityError('createSite', `site_exists:${siteId}`, 'cms_capability_unsupported');
    }
    const name = input.name.trim() || 'Untitled';
    const record: CmsSiteRecord = {
      id: siteId,
      name,
      initials: input.initials?.trim() || siteInitials(name),
      domain: input.domain ?? '',
      edited: 'just now',
      color: input.color ?? '#1e6a6f',
      theme: input.theme ? structuredClone(input.theme) : undefined,
      schemas: input.schemas ? structuredClone(input.schemas) : undefined,
    };
    this.db
      .prepare(
        `INSERT INTO cms_sites (id, name, initials, domain, edited, color, theme_json, schemas_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.name,
        record.initials,
        record.domain,
        record.edited,
        record.color,
        record.theme ? JSON.stringify(record.theme) : null,
        record.schemas ? JSON.stringify(record.schemas) : null,
      );
    return structuredClone(record);
  }

  async updateSite(siteId: string, patch: CmsSiteUpdatePatch): Promise<CmsSiteRecord> {
    const current = await this.getSite(siteId);
    const next: CmsSiteRecord = {
      ...current,
      ...patch,
      id: siteId,
      theme: patch.theme !== undefined ? structuredClone(patch.theme) : current.theme,
      schemas: patch.schemas !== undefined ? structuredClone(patch.schemas) : current.schemas,
      edited: 'just now',
    };
    this.db
      .prepare(
        `UPDATE cms_sites SET name = ?, initials = ?, domain = ?, edited = ?, color = ?, theme_json = ?, schemas_json = ?
         WHERE id = ?`,
      )
      .run(
        next.name,
        next.initials,
        next.domain,
        next.edited,
        next.color,
        next.theme ? JSON.stringify(next.theme) : null,
        next.schemas ? JSON.stringify(next.schemas) : null,
        siteId,
      );
    return structuredClone(next);
  }

  async deleteSite(siteId: string): Promise<void> {
    const result = this.db.prepare('DELETE FROM cms_sites WHERE id = ?').run(siteId);
    if (!result.changes) {
      throw new CmsCapabilityError('deleteSite', `site_not_found:${siteId}`, 'cms_source_not_found');
    }
  }

  async loadSite(siteId: string): Promise<CmsEditorSite> {
    const meta = await this.getSite(siteId);
    const pages = await this.listPages(siteId);
    return { ...meta, pages };
  }

  async listPages(siteId: string): Promise<CmsEditorPage[]> {
    this.siteRow(siteId);
    const rows = this.db
      .prepare('SELECT id FROM cms_pages WHERE site_id = ? ORDER BY sort_order ASC, title ASC')
      .all(siteId) as { id: string }[];
    return rows.map((row) => this.hydratePage(String(row.id)));
  }

  async getPage(pageId: string): Promise<CmsEditorPage> {
    return structuredClone(this.hydratePage(pageId));
  }

  async createPage(siteId: string, input: Partial<CmsEditorPage> & { title: string; slug: string }) {
    this.siteRow(siteId);
    const pageId = id('page');
    const slug = input.slug.startsWith('/') ? input.slug : `/${input.slug}`;
    this.db
      .prepare(
        `INSERT INTO cms_pages (id, site_id, title, slug, status, type, meta_title, meta_description, sort_order)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      )
      .run(
        pageId,
        siteId,
        input.title,
        slug,
        input.type || 'Interior',
        input.metaTitle || input.title,
        input.metaDescription || '',
        (this.db.prepare('SELECT COUNT(*) AS c FROM cms_pages WHERE site_id = ?').get(siteId) as { c: number }).c,
      );
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getPage(pageId);
  }

  async updatePage(pageId: string, patch: Partial<CmsEditorPage>) {
    const siteId = this.findPageSiteId(pageId);
    const current = await this.getPage(pageId);
    const next = { ...current, ...patch, id: current.id, sections: patch.sections ?? current.sections };
    this.db
      .prepare(
        `UPDATE cms_pages SET title = ?, slug = ?, status = ?, type = ?, meta_title = ?, meta_description = ? WHERE id = ?`,
      )
      .run(next.title, next.slug, next.status, next.type, next.metaTitle, next.metaDescription, pageId);
    if (patch.sections) {
      for (const section of next.sections) {
        await this.updateSection(section.id, section);
      }
    }
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getPage(pageId);
  }

  async deletePage(pageId: string) {
    const siteId = this.findPageSiteId(pageId);
    this.db.prepare('DELETE FROM cms_pages WHERE id = ?').run(pageId);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
  }

  async listSections(pageId: string) {
    return structuredClone((await this.getPage(pageId)).sections);
  }

  async getSection(sectionId: string) {
    const row = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(sectionId) as
      | { page_id: string }
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('getSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
    }
    const page = await this.getPage(String(row.page_id));
    const section = page.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new CmsCapabilityError('getSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
    }
    return structuredClone(section);
  }

  async createSection(pageId: string, input: Partial<CmsEditorSection> & { name: string }) {
    const siteId = this.findPageSiteId(pageId);
    const sectionId = id('sec');
    const sortOrder =
      (this.db.prepare('SELECT COUNT(*) AS c FROM cms_sections WHERE page_id = ?').get(pageId) as { c: number }).c *
      10;
    this.db
      .prepare(
        `INSERT INTO cms_sections (id, page_id, name, type, zone, visible, color, fields_json, css_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sectionId,
        pageId,
        input.name,
        input.type || input.name.toLowerCase().replace(/\s+/g, '-'),
        input.zone || 'BODY',
        input.visible === false ? 0 : 1,
        input.color || '#111115',
        JSON.stringify(input.fields || {}),
        JSON.stringify(input.css || {}),
        sortOrder,
      );
    for (const block of input.blocks || []) {
      await this.createBlock(sectionId, block);
    }
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getSection(sectionId);
  }

  async updateSection(sectionId: string, patch: Partial<CmsEditorSection>) {
    const row = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(sectionId) as
      | { page_id: string }
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('updateSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
    }
    const siteId = this.findPageSiteId(String(row.page_id));
    const current = await this.getSection(sectionId);
    const next = { ...current, ...patch, id: current.id, blocks: patch.blocks ?? current.blocks };
    this.db
      .prepare(
        `UPDATE cms_sections SET name = ?, type = ?, zone = ?, visible = ?, color = ?, fields_json = ?, css_json = ? WHERE id = ?`,
      )
      .run(
        next.name,
        next.type,
        next.zone,
        next.visible ? 1 : 0,
        next.color,
        JSON.stringify(next.fields),
        JSON.stringify(next.css || {}),
        sectionId,
      );
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getSection(sectionId);
  }

  async deleteSection(sectionId: string) {
    const row = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(sectionId) as
      | { page_id: string }
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('deleteSection', `section_not_found:${sectionId}`, 'cms_source_not_found');
    }
    const siteId = this.findPageSiteId(String(row.page_id));
    this.db.prepare('DELETE FROM cms_sections WHERE id = ?').run(sectionId);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
  }

  async reorderSections(pageId: string, sectionIds: string[]) {
    const siteId = this.findPageSiteId(pageId);
    const stmt = this.db.prepare('UPDATE cms_sections SET sort_order = ? WHERE id = ? AND page_id = ?');
    sectionIds.forEach((sectionId, index) => {
      stmt.run((index + 1) * 10, sectionId, pageId);
    });
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
  }

  async setSectionVisibility(sectionId: string, visible: boolean) {
    const row = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(sectionId) as
      | { page_id: string }
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('setSectionVisibility', `section_not_found:${sectionId}`, 'cms_source_not_found');
    }
    const siteId = this.findPageSiteId(String(row.page_id));
    this.db.prepare('UPDATE cms_sections SET visible = ? WHERE id = ?').run(visible ? 1 : 0, sectionId);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
  }

  async listBlocks(sectionId: string) {
    return structuredClone((await this.getSection(sectionId)).blocks);
  }

  async getBlock(blockId: string) {
    const row = this.db.prepare('SELECT * FROM cms_blocks WHERE id = ?').get(blockId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('getBlock', `block_not_found:${blockId}`, 'cms_source_not_found');
    }
    return {
      id: String(row.id),
      sectionId: String(row.section_id),
      type: String(row.type),
      visible: Number(row.visible) !== 0,
      data: parseJson(String(row.data_json), {}),
      sortOrder: Number(row.sort_order),
    } satisfies CmsEditorBlock;
  }

  async createBlock(sectionId: string, input: Partial<CmsEditorBlock> & { type: string }) {
    const sectionRow = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(sectionId) as
      | { page_id: string }
      | undefined;
    if (!sectionRow) {
      throw new CmsCapabilityError('createBlock', `section_not_found:${sectionId}`, 'cms_source_not_found');
    }
    const siteId = this.findPageSiteId(String(sectionRow.page_id));
    const blockId = id('blk');
    const sortOrder =
      input.sortOrder ??
      ((this.db.prepare('SELECT COUNT(*) AS c FROM cms_blocks WHERE section_id = ?').get(sectionId) as { c: number })
        .c +
        1) *
        10;
    this.db
      .prepare(
        `INSERT INTO cms_blocks (id, section_id, type, visible, data_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(blockId, sectionId, input.type, input.visible === false ? 0 : 1, JSON.stringify(input.data || {}), sortOrder);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getBlock(blockId);
  }

  async updateBlock(blockId: string, patch: Partial<CmsEditorBlock>) {
    const current = await this.getBlock(blockId);
    const sectionRow = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(current.sectionId) as
      | { page_id: string }
      | undefined;
    const siteId = this.findPageSiteId(String(sectionRow?.page_id));
    const next = { ...current, ...patch, id: current.id };
    this.db
      .prepare(`UPDATE cms_blocks SET type = ?, visible = ?, data_json = ?, sort_order = ? WHERE id = ?`)
      .run(next.type, next.visible ? 1 : 0, JSON.stringify(next.data), next.sortOrder, blockId);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getBlock(blockId);
  }

  async deleteBlock(blockId: string) {
    const current = await this.getBlock(blockId);
    const sectionRow = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(current.sectionId) as
      | { page_id: string }
      | undefined;
    const siteId = this.findPageSiteId(String(sectionRow?.page_id));
    this.db.prepare('DELETE FROM cms_blocks WHERE id = ?').run(blockId);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
  }

  async reorderBlocks(sectionId: string, blockIds: string[]) {
    const sectionRow = this.db.prepare('SELECT page_id FROM cms_sections WHERE id = ?').get(sectionId) as
      | { page_id: string }
      | undefined;
    const siteId = this.findPageSiteId(String(sectionRow?.page_id));
    const stmt = this.db.prepare('UPDATE cms_blocks SET sort_order = ? WHERE id = ? AND section_id = ?');
    blockIds.forEach((blockId, index) => {
      stmt.run((index + 1) * 10, blockId, sectionId);
    });
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
  }

  private applyDraftPayload(siteId: string, pageId: string, payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.sections)) {
      const sections = body.sections as CmsEditorSection[];
      for (const section of sections) {
        this.db
          .prepare(
            `UPDATE cms_sections SET name = ?, type = ?, zone = ?, visible = ?, color = ?, fields_json = ?, css_json = ? WHERE id = ? AND page_id = ?`,
          )
          .run(
            section.name,
            section.type,
            section.zone,
            section.visible ? 1 : 0,
            section.color,
            JSON.stringify(section.fields),
            JSON.stringify(section.css || {}),
            section.id,
            pageId,
          );
      }
    }
    if (body.theme && typeof body.theme === 'object') {
      this.db
        .prepare('UPDATE cms_sites SET theme_json = ?, edited = ? WHERE id = ?')
        .run(JSON.stringify(body.theme), 'just now', siteId);
    }
    if (body.schemas && typeof body.schemas === 'object') {
      this.db
        .prepare('UPDATE cms_sites SET schemas_json = ?, edited = ? WHERE id = ?')
        .run(JSON.stringify(body.schemas), 'just now', siteId);
    }
  }

  async saveDraft(pageId: string, payload: unknown) {
    const siteId = this.findPageSiteId(pageId);
    this.applyDraftPayload(siteId, pageId, payload);
    const page = await this.getPage(pageId);
    const site = await this.getSite(siteId);
    const revision: CmsRevision = {
      id: id('rev'),
      pageId,
      kind: 'draft',
      createdAt: new Date().toISOString(),
      snapshot: structuredClone({ ...page, theme: site.theme, schemas: site.schemas }),
    };
    this.db
      .prepare(
        `INSERT INTO cms_revisions (id, page_id, kind, created_at, snapshot_json) VALUES (?, ?, 'draft', ?, ?)`,
      )
      .run(revision.id, pageId, revision.createdAt, JSON.stringify(revision.snapshot));
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return structuredClone(revision);
  }

  async getRevision(revisionId: string) {
    const row = this.db.prepare('SELECT * FROM cms_revisions WHERE id = ?').get(revisionId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('getRevision', `revision_not_found:${revisionId}`, 'cms_source_not_found');
    }
    return {
      id: String(row.id),
      pageId: String(row.page_id),
      kind: String(row.kind) as CmsRevision['kind'],
      createdAt: String(row.created_at),
      label: row.label ? String(row.label) : undefined,
      snapshot: parseJson(String(row.snapshot_json), null),
    } satisfies CmsRevision;
  }

  async listRevisions(pageId: string) {
    const rows = this.db
      .prepare('SELECT id FROM cms_revisions WHERE page_id = ? ORDER BY created_at ASC')
      .all(pageId) as { id: string }[];
    const out: CmsRevision[] = [];
    for (const row of rows) {
      out.push(await this.getRevision(String(row.id)));
    }
    return out;
  }

  async restoreRevision(pageId: string, revisionId: string) {
    const revision = await this.getRevision(revisionId);
    const siteId = this.findPageSiteId(pageId);
    if (!revision.snapshot || typeof revision.snapshot !== 'object') {
      throw new CmsCapabilityError(
        'restoreRevision',
        `revision_snapshot_missing:${revisionId}`,
        'cms_source_not_found',
      );
    }
    const snap = revision.snapshot as CmsEditorPage & {
      theme?: CmsSiteRecord['theme'];
      schemas?: CmsSiteRecord['schemas'];
    };
    await this.updatePage(pageId, { ...snap, sections: snap.sections });
    if (snap.theme) await this.updateSite(siteId, { theme: snap.theme });
    if (snap.schemas) await this.updateSite(siteId, { schemas: snap.schemas });
    return this.getPage(pageId);
  }

  async previewDraft(pageId: string) {
    const page = await this.getPage(pageId);
    return { snapshot: structuredClone(page) };
  }

  async publish(pageId: string, options?: { revisionId?: string }) {
    if (options?.revisionId) {
      await this.restoreRevision(pageId, options.revisionId);
    }
    const siteId = this.findPageSiteId(pageId);
    const page = await this.getPage(pageId);
    page.status = 'live';
    this.db.prepare(`UPDATE cms_pages SET status = 'live' WHERE id = ?`).run(pageId);
    const revisionCount = (
      this.db.prepare('SELECT COUNT(*) AS c FROM cms_revisions WHERE page_id = ?').get(pageId) as { c: number }
    ).c;
    const snapshot: CmsPublicationSnapshot = {
      publicationId: id('pub'),
      route: page.slug,
      revision: revisionCount + 1,
      theme: 'default',
      sections: page.sections.map((section) => ({
        type: section.type,
        props: { ...section.fields, name: section.name, blocks: section.blocks },
      })),
      publishedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO cms_publications (page_id, publication_id, route, revision_num, theme, sections_json, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(page_id) DO UPDATE SET
           publication_id = excluded.publication_id,
           route = excluded.route,
           revision_num = excluded.revision_num,
           theme = excluded.theme,
           sections_json = excluded.sections_json,
           published_at = excluded.published_at`,
      )
      .run(
        pageId,
        snapshot.publicationId,
        snapshot.route,
        snapshot.revision,
        snapshot.theme,
        JSON.stringify(snapshot.sections),
        snapshot.publishedAt,
      );
    const pubRevision: CmsRevision = {
      id: id('rev'),
      pageId,
      kind: 'publication',
      createdAt: snapshot.publishedAt!,
      snapshot: structuredClone(page),
    };
    this.db
      .prepare(
        `INSERT INTO cms_revisions (id, page_id, kind, created_at, snapshot_json) VALUES (?, ?, 'publication', ?, ?)`,
      )
      .run(pubRevision.id, pageId, pubRevision.createdAt, JSON.stringify(pubRevision.snapshot));
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return structuredClone(snapshot);
  }

  async getPublishedRevision(pageId: string) {
    const row = this.db.prepare('SELECT * FROM cms_publications WHERE page_id = ?').get(pageId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      publicationId: String(row.publication_id),
      route: String(row.route),
      revision: Number(row.revision_num),
      theme: String(row.theme),
      sections: parseJson(String(row.sections_json), []),
      publishedAt: row.published_at ? String(row.published_at) : undefined,
      metadata: parseJson(String(row.metadata_json), undefined),
    } satisfies CmsPublicationSnapshot;
  }

  async listAssets(siteId: string) {
    this.siteRow(siteId);
    const rows = this.db.prepare('SELECT * FROM cms_assets WHERE site_id = ? ORDER BY created_at DESC').all(siteId) as
      Record<string, unknown>[];
    return rows.map(
      (row): CmsAsset => ({
        id: String(row.id),
        name: String(row.name),
        mimeType: row.mime_type ? String(row.mime_type) : undefined,
        size: row.size != null ? Number(row.size) : undefined,
        url: row.url ? String(row.url) : undefined,
        key: row.asset_key ? String(row.asset_key) : undefined,
        createdAt: row.created_at ? String(row.created_at) : undefined,
        metadata: parseJson(String(row.metadata_json), undefined),
      }),
    );
  }

  async getAsset(assetId: string) {
    const row = this.db.prepare('SELECT * FROM cms_assets WHERE id = ?').get(assetId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('getAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
    }
    return {
      id: String(row.id),
      name: String(row.name),
      mimeType: row.mime_type ? String(row.mime_type) : undefined,
      size: row.size != null ? Number(row.size) : undefined,
      url: row.url ? String(row.url) : undefined,
      key: row.asset_key ? String(row.asset_key) : undefined,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      metadata: parseJson(String(row.metadata_json), undefined),
    } satisfies CmsAsset;
  }

  async uploadAsset(siteId: string, file: Blob, meta?: { name?: string; metadata?: Record<string, unknown> }) {
    this.siteRow(siteId);
    const assetId = id('asset');
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO cms_assets (id, site_id, name, mime_type, size, created_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        assetId,
        siteId,
        meta?.name || 'upload',
        file.type || null,
        file.size,
        createdAt,
        meta?.metadata ? JSON.stringify(meta.metadata) : null,
      );
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(siteId);
    return this.getAsset(assetId);
  }

  async updateAsset(assetId: string, patch: Partial<Pick<CmsAsset, 'name' | 'metadata' | 'url' | 'key'>>) {
    const current = await this.getAsset(assetId);
    const row = this.db.prepare('SELECT site_id FROM cms_assets WHERE id = ?').get(assetId) as { site_id: string };
    this.db
      .prepare(`UPDATE cms_assets SET name = ?, url = ?, asset_key = ?, metadata_json = ? WHERE id = ?`)
      .run(
        patch.name ?? current.name,
        patch.url ?? current.url ?? null,
        patch.key ?? current.key ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : current.metadata ? JSON.stringify(current.metadata) : null,
        assetId,
      );
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(String(row.site_id));
    return this.getAsset(assetId);
  }

  async deleteAsset(assetId: string) {
    const row = this.db.prepare('SELECT site_id FROM cms_assets WHERE id = ?').get(assetId) as
      | { site_id: string }
      | undefined;
    if (!row) {
      throw new CmsCapabilityError('deleteAsset', `asset_not_found:${assetId}`, 'cms_source_not_found');
    }
    this.db.prepare('DELETE FROM cms_assets WHERE id = ?').run(assetId);
    this.db.prepare(`UPDATE cms_sites SET edited = 'just now' WHERE id = ?`).run(String(row.site_id));
  }
}
