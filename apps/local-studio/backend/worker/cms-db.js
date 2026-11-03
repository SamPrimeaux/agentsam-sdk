/**
 * Site-scoped CMS D1 data access for Local Studio.
 *
 * cms_sites.id is the page ownership boundary. Page, section, block, activity,
 * and import reads/writes are scoped through site_id; project/workspace/person
 * aliases are not page identity.
 */

export function assertCmsSiteIdentity(site) {
  const id = typeof site?.id === 'string' ? site.id.trim() : '';
  const accountId = typeof site?.account_id === 'string' ? site.account_id.trim() : '';
  if (!id || !accountId) {
    throw new Error('CMS Site Identity Violation: site id and account_id are required');
  }
  return { ...site, id, account_id: accountId };
}

const BLOCK_SELECT = `SELECT b.*, b.block_type AS component_type, b.content_json AS component_data,
  CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_visible
  FROM cms_section_blocks b
  JOIN cms_page_sections s ON b.section_id = s.id
  JOIN cms_pages p ON s.page_id = p.id`;

// cms_section_blocks.content_json / settings_json are CHECKed as JSON objects.
function toJsonObjectString(value, field) {
  let parsed = value ?? {};
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); }
    catch { throw new Error(`${field}_must_be_valid_json`); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field}_must_be_a_json_object`);
  }
  return JSON.stringify(parsed);
}

function toBlockKey(value, type) {
  const clean = (v) => String(v).toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (value) return clean(value) || 'block';
  return `${clean(type) || 'block'}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createCmsDbClient(db, rawSite) {
  const identity = assertCmsSiteIdentity(rawSite);
  const siteId = identity.id;
  const siteSlug = typeof identity.slug === 'string' ? identity.slug.trim() : '';
  let siteCache = null;

  async function resolveSite() {
    if (siteCache) return siteCache;
    const row = await db.prepare(`
      SELECT id, account_id, slug, name, primary_domain, worker_id
      FROM cms_sites
      WHERE id = ? AND account_id = ? AND status <> 'archived'
      LIMIT 1
    `).bind(siteId, identity.account_id).first();
    if (!row?.id || !row?.account_id) throw new Error(`cms_site_not_found:${siteId}`);
    siteCache = row;
    return row;
  }

  return {
    siteId,
    siteSlug,

    async getSite() {
      return resolveSite();
    },

    async getPages() {
      await resolveSite();
      const res = await db.prepare(`
        SELECT * FROM cms_pages
        WHERE site_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `).bind(siteId).all();
      return res.results || [];
    },

    async getPageById(pageId) {
      if (!pageId) return null;
      await resolveSite();
      return (await db.prepare(`
        SELECT * FROM cms_pages WHERE id = ? AND site_id = ? LIMIT 1
      `).bind(pageId, siteId).first()) || null;
    },

    async getSectionsForPage(pageId) {
      if (!pageId || !(await this.getPageById(pageId))) return [];
      const res = await db.prepare(`
        SELECT s.* FROM cms_page_sections s
        JOIN cms_pages p ON s.page_id = p.id
        WHERE s.page_id = ? AND p.site_id = ?
        ORDER BY s.sort_order ASC
      `).bind(pageId, siteId).all();
      return res.results || [];
    },

    async getAllSectionsForSite() {
      await resolveSite();
      const res = await db.prepare(`
        SELECT s.* FROM cms_page_sections s
        JOIN cms_pages p ON s.page_id = p.id
        WHERE p.site_id = ?
        ORDER BY s.sort_order ASC
      `).bind(siteId).all();
      return res.results || [];
    },

    async getAllBlocksForSite() {
      await resolveSite();
      const res = await db.prepare(`
        ${BLOCK_SELECT}
        WHERE p.site_id = ?
        ORDER BY b.sort_order ASC
      `).bind(siteId).all();
      return res.results || [];
    },

    async getBlocksForSection(sectionId) {
      if (!sectionId) return [];
      await resolveSite();
      const res = await db.prepare(`
        ${BLOCK_SELECT}
        WHERE b.section_id = ? AND p.site_id = ?
        ORDER BY b.sort_order ASC
      `).bind(sectionId, siteId).all();
      return res.results || [];
    },

    async createPage({ id, title, slug, routePath, pageType = 'custom', status = 'draft' }) {
      if (status !== 'draft') throw new Error('cms_page_must_start_as_draft');
      await resolveSite();
      const pageSchema = await db.prepare('PRAGMA table_info(cms_pages)').all();
      const pageColumns = new Set((pageSchema.results || []).map(column => column.name));
      const legacyPageColumns = [
        'project_id', 'project_slug', 'workspace_id', 'worker_id',
        'person_uuid', 'path', 'is_homepage', 'is_active',
      ];
      if (legacyPageColumns.some(column => pageColumns.has(column)) ||
          pageColumns.has('account_id') || pageColumns.has('legacy_page_id') ||
          !pageColumns.has('site_id') || !pageColumns.has('route_path')) {
        throw new Error('cms_pages_site_identity_migration_required');
      }
      const cleanTitle = String(title || '').trim();
      const cleanSlug = String(slug || '').trim().toLowerCase();
      const cleanRoute = String(routePath || '').trim();
      const allowedTypes = new Set([
        'home', 'about', 'services', 'work', 'case_study', 'contact', 'pricing',
        'privacy', 'terms', 'faq', 'product', 'collection', 'blog', 'post',
        'landing', 'portal', 'dashboard', 'auth', 'sitemap', 'custom',
      ]);
      if (!cleanTitle || cleanTitle.length > 200) throw new Error('cms_page_title_invalid');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug) || cleanSlug.length > 80) {
        throw new Error('cms_page_slug_invalid');
      }
      if (!/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?\/?$/.test(cleanRoute)) {
        throw new Error('cms_page_route_invalid');
      }
      const normalizedType = allowedTypes.has(pageType) ? pageType : 'custom';
      const maxOrder = await db.prepare(
        'SELECT COALESCE(MAX(sort_order), -10) AS max_sort_order FROM cms_pages WHERE site_id = ?'
      ).bind(siteId).first();
      const pageId = id || `cmsp_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const now = Math.floor(Date.now() / 1000);
      try {
        await db.prepare(`
          INSERT INTO cms_pages (
            id, site_id, slug, route_path, page_type, title, status,
            sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
        `).bind(pageId, siteId, cleanSlug, cleanRoute, normalizedType, cleanTitle,
          Number(maxOrder?.max_sort_order || 0) + 10, now, now).run();
      } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || error))) {
          throw new Error('cms_page_slug_or_route_already_exists');
        }
        throw error;
      }
      return this.getPageById(pageId);
    },

    async updatePage(pageId, updates = {}) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Page ${pageId} not found for site ${siteId}`);
      if (updates.status !== undefined && updates.status !== page.status &&
          updates.status !== 'draft') {
        throw new Error('cms_page_status_transition_requires_publish_workflow');
      }

      const title = updates.title !== undefined ? updates.title : page.title;
      const slug = updates.slug !== undefined ? updates.slug : page.slug;
      const routePath = updates.route_path !== undefined ? updates.route_path : page.route_path;
      const pageType = updates.page_type !== undefined ? updates.page_type : page.page_type;
      const seoTitle = updates.seo_title !== undefined ? updates.seo_title : page.seo_title;
      const metaDescription = updates.meta_description !== undefined ? updates.meta_description : page.meta_description;
      const canonicalUrl = updates.canonical_url !== undefined ? updates.canonical_url : page.canonical_url;
      const status = updates.status !== undefined ? updates.status : page.status;
      const now = Math.floor(Date.now() / 1000);

      await db.prepare(`
        UPDATE cms_pages
        SET title = ?, slug = ?, route_path = ?, page_type = ?,
            seo_title = ?, meta_description = ?, canonical_url = ?,
            status = ?, updated_at = ?
        WHERE id = ? AND site_id = ?
      `).bind(title, slug, routePath, pageType, seoTitle, metaDescription,
        canonicalUrl, status, now, pageId, siteId).run();

      return this.getPageById(pageId);
    },

    async deletePage(pageId) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Page ${pageId} not found for site ${siteId}`);
      // cms_page_sections and cms_live_edit_sessions cascade from cms_pages;
      // cms_section_blocks cascade from cms_page_sections.
      await db.prepare('DELETE FROM cms_pages WHERE id = ? AND site_id = ?')
        .bind(pageId, siteId).run();
    },

    async publishPage(pageId, publishedBy = 'system') {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Page ${pageId} not found for site ${siteId}`);
      const now = Math.floor(Date.now() / 1000);
      await db.prepare(`
        UPDATE cms_pages
        SET status = 'published', published_at = ?, published_by = ?, updated_at = ?
        WHERE id = ? AND site_id = ?
      `).bind(now, publishedBy, now, pageId, siteId).run();
      return this.getPageById(pageId);
    },

    async createSection({ pageId, sectionType, sectionName, sectionData = {}, sortOrder = 0 }) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Target page ${pageId} does not belong to site ${siteId}`);
      const sectionId = `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const dataStr = typeof sectionData === 'string' ? sectionData : JSON.stringify(sectionData);
      await db.prepare(`
        INSERT INTO cms_page_sections (
          id, page_id, section_type, section_name, section_data, sort_order, is_visible
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).bind(sectionId, pageId, sectionType, sectionName, dataStr, sortOrder).run();
      return (await db.prepare('SELECT * FROM cms_page_sections WHERE id = ?')
        .bind(sectionId).first()) || null;
    },

    async updateSection(sectionId, updates = {}) {
      const existing = await db.prepare(`
        SELECT s.* FROM cms_page_sections s
        JOIN cms_pages p ON s.page_id = p.id
        WHERE s.id = ? AND p.site_id = ?
        LIMIT 1
      `).bind(sectionId, siteId).first();
      if (!existing) throw new Error(`Section ${sectionId} not found for site ${siteId}`);

      const sectionName = updates.section_name !== undefined ? updates.section_name : existing.section_name;
      const sectionData = updates.section_data !== undefined
        ? (typeof updates.section_data === 'string' ? updates.section_data : JSON.stringify(updates.section_data))
        : existing.section_data;
      const cssClasses = updates.css_classes !== undefined ? updates.css_classes : existing.css_classes;
      const customCss = updates.custom_css !== undefined ? updates.custom_css : existing.custom_css;

      await db.prepare(`
        UPDATE cms_page_sections
        SET section_name = ?, section_data = ?, css_classes = ?, custom_css = ?,
            updated_at = datetime('now')
        WHERE id = ? AND page_id IN (
          SELECT id FROM cms_pages WHERE site_id = ?
        )
      `).bind(sectionName, sectionData, cssClasses, customCss, sectionId, siteId).run();

      return (await db.prepare('SELECT * FROM cms_page_sections WHERE id = ?')
        .bind(sectionId).first()) || null;
    },

    async deleteSection(sectionId) {
      const owned = await db.prepare(`
        SELECT s.id FROM cms_page_sections s
        JOIN cms_pages p ON s.page_id = p.id
        WHERE s.id = ? AND p.site_id = ? LIMIT 1
      `).bind(sectionId, siteId).first();
      if (!owned) throw new Error(`Section ${sectionId} not found for site ${siteId}`);
      await db.prepare('DELETE FROM cms_section_blocks WHERE section_id = ?').bind(sectionId).run();
      await db.prepare(`
        DELETE FROM cms_page_sections
        WHERE id = ? AND page_id IN (SELECT id FROM cms_pages WHERE site_id = ?)
      `).bind(sectionId, siteId).run();
    },

    async setSectionVisibility(sectionId, isVisible) {
      const owned = await db.prepare(`
        SELECT s.id FROM cms_page_sections s
        JOIN cms_pages p ON p.id = s.page_id
        WHERE s.id = ? AND p.site_id = ? LIMIT 1
      `).bind(sectionId, siteId).first();
      if (!owned) throw new Error(`Section ${sectionId} not found for site ${siteId}`);
      await db.prepare(`
        UPDATE cms_page_sections
        SET is_visible = ?, updated_at = datetime('now')
        WHERE id = ? AND page_id IN (SELECT id FROM cms_pages WHERE site_id = ?)
      `).bind(isVisible ? 1 : 0, sectionId, siteId).run();
      return (await db.prepare('SELECT * FROM cms_page_sections WHERE id = ?')
        .bind(sectionId).first()) || null;
    },

    async reorderSections(pageId, orderList) {
      if (!(await this.getPageById(pageId))) {
        throw new Error(`Target page ${pageId} does not belong to site ${siteId}`);
      }
      for (const item of orderList || []) {
        if (!item?.id) continue;
        await db.prepare(`
          UPDATE cms_page_sections
          SET sort_order = ?, updated_at = datetime('now')
          WHERE id = ? AND page_id = ?
        `).bind(Number(item.sort_order || 0), item.id, pageId).run();
      }
      return this.getSectionsForPage(pageId);
    },

    async getBlockById(blockId) {
      if (!blockId) return null;
      await resolveSite();
      return (await db.prepare(`
        ${BLOCK_SELECT}
        WHERE b.id = ? AND p.site_id = ?
        LIMIT 1
      `).bind(blockId, siteId).first()) || null;
    },

    async createBlock({ sectionId, componentType, componentData = {}, sortOrder = 0, blockKey }) {
      const owned = await db.prepare(`
        SELECT s.id FROM cms_page_sections s
        JOIN cms_pages p ON s.page_id = p.id
        WHERE s.id = ? AND p.site_id = ? LIMIT 1
      `).bind(sectionId, siteId).first();
      if (!owned) throw new Error(`Section ${sectionId} does not belong to site ${siteId}`);

      const type = String(componentType || '').trim();
      if (!type) throw new Error('cms_block_type_required');
      const { account_id: accountId } = await resolveSite();
      const blockId = `cmsb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await db.prepare(`
        INSERT INTO cms_section_blocks (
          id, account_id, section_id, block_key, block_type, sort_order, status, content_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `).bind(blockId, accountId, sectionId, toBlockKey(blockKey, type), type,
        sortOrder, toJsonObjectString(componentData, 'component_data')).run();
      return this.getBlockById(blockId);
    },

    async updateBlock(blockId, updates = {}) {
      const existing = await this.getBlockById(blockId);
      if (!existing) throw new Error(`Block ${blockId} does not belong to site ${siteId}`);
      const type = updates.component_type !== undefined
        ? String(updates.component_type).trim() : existing.block_type;
      if (!type) throw new Error('cms_block_type_required');
      const content = updates.component_data !== undefined
        ? toJsonObjectString(updates.component_data, 'component_data') : existing.content_json;
      const settings = updates.settings_json !== undefined
        ? toJsonObjectString(updates.settings_json, 'settings_json') : existing.settings_json;
      await db.prepare(`
        UPDATE cms_section_blocks
        SET block_type = ?, content_json = ?, settings_json = ?, updated_at = datetime('now')
        WHERE id = ? AND section_id IN (
          SELECT s.id FROM cms_page_sections s
          JOIN cms_pages p ON s.page_id = p.id
          WHERE p.site_id = ?
        )
      `).bind(type, content, settings, blockId, siteId).run();
      return this.getBlockById(blockId);
    },

    async deleteBlock(blockId) {
      const existing = await this.getBlockById(blockId);
      if (!existing) throw new Error(`Block ${blockId} not found for site ${siteId}`);
      await db.prepare(`
        DELETE FROM cms_section_blocks
        WHERE id = ? AND section_id IN (
          SELECT s.id FROM cms_page_sections s
          JOIN cms_pages p ON s.page_id = p.id
          WHERE p.site_id = ?
        )
      `).bind(blockId, siteId).run();
    },

    async setBlockVisibility(blockId, isVisible) {
      await db.prepare(`
        UPDATE cms_section_blocks
        SET status = ?, updated_at = datetime('now')
        WHERE id = ? AND status <> 'archived' AND section_id IN (
          SELECT s.id FROM cms_page_sections s
          JOIN cms_pages p ON s.page_id = p.id
          WHERE p.site_id = ?
        )
      `).bind(isVisible ? 'active' : 'hidden', blockId, siteId).run();
      return this.getBlockById(blockId);
    },

    async reorderBlocks(orderList) {
      const statements = [];
      for (const item of orderList || []) {
        if (!item?.id) continue;
        statements.push(db.prepare(`
          UPDATE cms_section_blocks
          SET sort_order = ?, updated_at = datetime('now')
          WHERE id = ? AND section_id IN (
            SELECT s.id FROM cms_page_sections s
            JOIN cms_pages p ON s.page_id = p.id
            WHERE p.site_id = ?
          )
        `).bind(Number(item.sort_order || 0), item.id, siteId));
      }
      if (statements.length) await db.batch(statements);
    },

    async getThemeOverrides() {
      await resolveSite();
      const res = await db.prepare(`
        SELECT * FROM cms_site_theme_overrides
        WHERE site_id = ?
        ORDER BY updated_at DESC LIMIT 1
      `).bind(siteId).all();
      return res.results?.[0] || null;
    },

    async saveThemeOverrides(vars, actorUserId = null) {
      const varsJson = toJsonObjectString(vars, 'vars');
      const now = Math.floor(Date.now() / 1000);
      const site = await resolveSite();
      // Keep the existing overrides table's legacy composite key intact. The
      // page table no longer carries project_slug/workspace_id identity.
      const existing = await db.prepare(`
        SELECT workspace_id, project_slug FROM cms_site_theme_overrides
        WHERE site_id = ? ORDER BY updated_at DESC LIMIT 1
      `).bind(siteId).first();
      const workspaceId = existing?.workspace_id ?? '';
      const projectSlug = existing?.project_slug || site.slug || siteId;
      await db.prepare(`
        INSERT INTO cms_site_theme_overrides (
          site_id, workspace_id, project_slug, vars_json, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(site_id, workspace_id, project_slug)
        DO UPDATE SET vars_json = excluded.vars_json,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at
      `).bind(siteId, workspaceId, projectSlug, varsJson, actorUserId, now).run();
      return this.getThemeOverrides();
    },

    async getLiquidImports() {
      await resolveSite();
      const res = await db.prepare(`
        SELECT * FROM cms_liquid_imports
        WHERE site_id = ?
        ORDER BY created_at DESC
      `).bind(siteId).all();
      return res.results || [];
    },

    async getActivity() {
      await resolveSite();
      const res = await db.prepare(`
        SELECT * FROM cms_activity_log
        WHERE site_id = ?
        ORDER BY created_at DESC LIMIT 20
      `).bind(siteId).all();
      return res.results || [];
    },

    async getTemplates() {
      await resolveSite();
      const res = await db.prepare(`
        SELECT * FROM cms_component_templates
        WHERE is_system = 1 OR sku IN (
          SELECT s.template_sku FROM cms_page_sections s
          JOIN cms_pages p ON p.id = s.page_id
          WHERE p.site_id = ? AND s.template_sku IS NOT NULL
        )
        ORDER BY sort_order ASC LIMIT 50
      `).bind(siteId).all();
      return res.results || [];
    },
  };
}
