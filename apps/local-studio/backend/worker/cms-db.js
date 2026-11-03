/**
 * Strict Tenant-Isolated CMS D1 Data Access Helper.
 *
 * Enforces logical tenancy across the shared `inneranimalmedia-business` D1 database.
 * EVERY database query and mutation requires a non-empty `projectSlug` as an enforced invariant.
 * Hand-written queries without tenancy constraints are strictly forbidden.
 */

export function assertProjectSlug(slug) {
  if (typeof slug !== 'string' || !slug.trim()) {
    throw new Error('CMS Tenancy Invariant Violation: projectSlug is required and non-optional');
  }
  return slug.trim();
}

const BLOCK_SELECT = `SELECT b.*, b.block_type AS component_type, b.content_json AS component_data,
  CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_visible
  FROM cms_section_blocks b
  JOIN cms_page_sections s ON b.section_id = s.id
  JOIN cms_pages p ON s.page_id = p.id`;

// cms_section_blocks.content_json / settings_json are CHECKed to be JSON objects.
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
  const clean = (v) => String(v).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (value) return clean(value) || 'block';
  return `${clean(type) || 'block'}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createCmsDbClient(db, rawProjectSlug) {
  const projectSlug = assertProjectSlug(rawProjectSlug);

  // The site is the ownership boundary: account_id lives on cms_sites, and
  // cms_pages.site_id is NOT NULL. Resolved from data, never hardcoded.
  let siteCache = null;
  async function resolveSite() {
    if (siteCache) return siteCache;
    let row = await db
      .prepare(
        `SELECT p.site_id, p.project_id, p.workspace_id, st.account_id
           FROM cms_pages p JOIN cms_sites st ON st.id = p.site_id
          WHERE p.project_slug = ? LIMIT 1`
      )
      .bind(projectSlug)
      .first();
    if (!row) {
      const sites = await db
        .prepare(`SELECT id AS site_id, NULL AS project_id, NULL AS workspace_id, account_id FROM cms_sites WHERE slug = ? LIMIT 2`)
        .bind(projectSlug)
        .all();
      if ((sites.results || []).length === 1) row = sites.results[0];
    }
    if (!row?.site_id || !row?.account_id) throw new Error(`cms_site_not_found_for_project:${projectSlug}`);
    siteCache = row;
    return row;
  }

  return {
    projectSlug,

    async getProject() {
      const sanitizedSlug = projectSlug.replace(/[^a-zA-Z0-9_]/g, '_');
      const res = await db
        .prepare('SELECT * FROM projects WHERE id = ? OR id = ? OR project_id = ? OR name = ? LIMIT 1')
        .bind(projectSlug, `proj_${sanitizedSlug}`, projectSlug, projectSlug)
        .all();
      return res.results?.[0] || null;
    },

    async getPages() {
      const res = await db
        .prepare('SELECT * FROM cms_pages WHERE project_slug = ? ORDER BY sort_order ASC, created_at ASC')
        .bind(projectSlug)
        .all();
      return res.results || [];
    },

    async getPageById(pageId) {
      if (!pageId) return null;
      const res = await db
        .prepare('SELECT * FROM cms_pages WHERE id = ? AND project_slug = ? LIMIT 1')
        .bind(pageId, projectSlug)
        .all();
      return res.results?.[0] || null;
    },

    async getSectionsForPage(pageId) {
      if (!pageId) return [];
      const res = await db
        .prepare(
          `SELECT s.* FROM cms_page_sections s
           JOIN cms_pages p ON s.page_id = p.id
           WHERE s.page_id = ? AND p.project_slug = ?
           ORDER BY s.sort_order ASC`
        )
        .bind(pageId, projectSlug)
        .all();
      return res.results || [];
    },

    async getAllSectionsForSite() {
      const res = await db
        .prepare(
          `SELECT s.* FROM cms_page_sections s
           JOIN cms_pages p ON s.page_id = p.id
           WHERE p.project_slug = ?
           ORDER BY s.sort_order ASC`
        )
        .bind(projectSlug)
        .all();
      return res.results || [];
    },

    async getAllBlocksForSite() {
      const res = await db
        .prepare(
          `SELECT b.*, b.block_type AS component_type, b.content_json AS component_data, CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_visible FROM cms_section_blocks b
           JOIN cms_page_sections s ON b.section_id = s.id
           JOIN cms_pages p ON s.page_id = p.id
           WHERE p.project_slug = ?
           ORDER BY b.sort_order ASC`
        )
        .bind(projectSlug)
        .all();
      return res.results || [];
    },

    async getBlocksForSection(sectionId) {
      if (!sectionId) return [];
      const res = await db
        .prepare(
          `SELECT b.*, b.block_type AS component_type, b.content_json AS component_data, CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_visible FROM cms_section_blocks b
           JOIN cms_page_sections s ON b.section_id = s.id
           JOIN cms_pages p ON s.page_id = p.id
           WHERE b.section_id = ? AND p.project_slug = ?
           ORDER BY b.sort_order ASC`
        )
        .bind(sectionId, projectSlug)
        .all();
      return res.results || [];
    },

    async createPage({ id, title, slug, routePath, pageType, status = 'draft', projectId }) {
      if (status !== 'draft') throw new Error('cms_page_must_start_as_draft');
      const site = await resolveSite();
      const resolvedProjectId = projectId || site.project_id;
      if (!resolvedProjectId) throw new Error('cms_page_authorized_project_required');
      const pageId = id || `page_${projectSlug}_${slug}_${Date.now().toString(36)}`;
      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          `INSERT INTO cms_pages (
            id, project_id, project_slug, site_id, slug, path, route_path,
            page_type, title, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(pageId, resolvedProjectId, projectSlug, site.site_id, slug, routePath, routePath, pageType, title, status, now, now)
        .run();
      return this.getPageById(pageId);
    },

    async updatePage(pageId, updates) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Page ${pageId} not found for project ${projectSlug}`);

      const title = updates.title !== undefined ? updates.title : page.title;
      const slug = updates.slug !== undefined ? updates.slug : page.slug;
      const routePath = updates.route_path !== undefined ? updates.route_path : page.route_path;
      const pageType = updates.page_type !== undefined ? updates.page_type : page.page_type;
      const seoTitle = updates.seo_title !== undefined ? updates.seo_title : page.seo_title;
      const metaDescription = updates.meta_description !== undefined ? updates.meta_description : page.meta_description;
      const status = updates.status !== undefined ? updates.status : page.status;
      const now = Math.floor(Date.now() / 1000);

      await db
        .prepare(
          `UPDATE cms_pages
           SET title = ?, slug = ?, route_path = ?, path = ?, page_type = ?,
               seo_title = ?, meta_description = ?, status = ?, updated_at = ?
           WHERE id = ? AND project_slug = ?`
        )
        .bind(title, slug, routePath, routePath, pageType, seoTitle, metaDescription, status, now, pageId, projectSlug)
        .run();

      return this.getPageById(pageId);
    },

    async deletePage(pageId) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Page ${pageId} not found for project ${projectSlug}`);

      await db
        .prepare(
          `DELETE FROM cms_section_blocks
           WHERE section_id IN (
             SELECT s.id FROM cms_page_sections s
             JOIN cms_pages p ON s.page_id = p.id
             WHERE p.id = ? AND p.project_slug = ?
           )`
        )
        .bind(pageId, projectSlug)
        .run();

      await db
        .prepare(
          `DELETE FROM cms_page_sections
           WHERE page_id IN (SELECT id FROM cms_pages WHERE id = ? AND project_slug = ?)`
        )
        .bind(pageId, projectSlug)
        .run();

      await db
        .prepare('DELETE FROM cms_pages WHERE id = ? AND project_slug = ?')
        .bind(pageId, projectSlug)
        .run();
    },

    async publishPage(pageId, publishedBy = 'system') {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Page ${pageId} not found for project ${projectSlug}`);

      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          `UPDATE cms_pages
           SET status = 'published', published_at = ?, published_by = ?, updated_at = ?
           WHERE id = ? AND project_slug = ?`
        )
        .bind(now, publishedBy, now, pageId, projectSlug)
        .run();

      return this.getPageById(pageId);
    },

    async createSection({ pageId, sectionType, sectionName, sectionData = {}, sortOrder = 0 }) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Target page ${pageId} does not belong to project ${projectSlug}`);

      const sectionId = `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const dataStr = typeof sectionData === 'string' ? sectionData : JSON.stringify(sectionData);

      await db
        .prepare(
          `INSERT INTO cms_page_sections (
            id, page_id, section_type, section_name, section_data, sort_order, is_visible
          ) VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .bind(sectionId, pageId, sectionType, sectionName, dataStr, sortOrder)
        .run();

      const res = await db.prepare('SELECT * FROM cms_page_sections WHERE id = ?').bind(sectionId).all();
      return res.results?.[0] || null;
    },

    async updateSection(sectionId, updates) {
      // Must verify section belongs to this project
      const sections = await db
        .prepare(
          `SELECT s.* FROM cms_page_sections s
           JOIN cms_pages p ON s.page_id = p.id
           WHERE s.id = ? AND p.project_slug = ?`
        )
        .bind(sectionId, projectSlug)
        .all();

      const existing = sections.results?.[0];
      if (!existing) throw new Error(`Section ${sectionId} not found for project ${projectSlug}`);

      const sectionName = updates.section_name !== undefined ? updates.section_name : existing.section_name;
      const sectionData = updates.section_data !== undefined
        ? (typeof updates.section_data === 'string' ? updates.section_data : JSON.stringify(updates.section_data))
        : existing.section_data;
      const cssClasses = updates.css_classes !== undefined ? updates.css_classes : existing.css_classes;
      const customCss = updates.custom_css !== undefined ? updates.custom_css : existing.custom_css;

      await db
        .prepare(
          `UPDATE cms_page_sections
           SET section_name = ?, section_data = ?, css_classes = ?, custom_css = ?, updated_at = datetime('now')
           WHERE id = ? AND page_id IN (SELECT id FROM cms_pages WHERE project_slug = ?)`
        )
        .bind(sectionName, sectionData, cssClasses, customCss, sectionId, projectSlug)
        .run();

      const updated = await db.prepare('SELECT * FROM cms_page_sections WHERE id = ?').bind(sectionId).all();
      return updated.results?.[0] || null;
    },

    async deleteSection(sectionId) {
      const owned = await db
        .prepare(
          `SELECT s.id FROM cms_page_sections s
           JOIN cms_pages p ON s.page_id = p.id
           WHERE s.id = ? AND p.project_slug = ? LIMIT 1`
        )
        .bind(sectionId, projectSlug)
        .all();
      if (!owned.results?.length) {
        throw new Error(`Section ${sectionId} not found for project ${projectSlug}`);
      }

      await db.prepare('DELETE FROM cms_section_blocks WHERE section_id = ?').bind(sectionId).run();
      await db
        .prepare(
          `DELETE FROM cms_page_sections
           WHERE id = ? AND page_id IN (SELECT id FROM cms_pages WHERE project_slug = ?)`
        )
        .bind(sectionId, projectSlug)
        .run();
    },

    async setSectionVisibility(sectionId, isVisible) {
      await db
        .prepare(
          `UPDATE cms_page_sections
           SET is_visible = ?, updated_at = datetime('now')
           WHERE id = ? AND page_id IN (SELECT id FROM cms_pages WHERE project_slug = ?)`
        )
        .bind(isVisible ? 1 : 0, sectionId, projectSlug)
        .run();

      const updated = await db.prepare('SELECT * FROM cms_page_sections WHERE id = ?').bind(sectionId).all();
      return updated.results?.[0] || null;
    },

    async reorderSections(pageId, orderList) {
      const page = await this.getPageById(pageId);
      if (!page) throw new Error(`Target page ${pageId} does not belong to project ${projectSlug}`);

      for (const item of orderList) {
        if (!item?.id) continue;
        await db
          .prepare(
            `UPDATE cms_page_sections
             SET sort_order = ?, updated_at = datetime('now')
             WHERE id = ? AND page_id = ?`
          )
          .bind(Number(item.sort_order || 0), item.id, pageId)
          .run();
      }
      return this.getSectionsForPage(pageId);
    },

    async getBlockById(blockId) {
      if (!blockId) return null;
      return (await db
        .prepare(`${BLOCK_SELECT} WHERE b.id = ? AND p.project_slug = ? LIMIT 1`)
        .bind(blockId, projectSlug)
        .first()) || null;
    },

    async createBlock({ sectionId, componentType, componentData = {}, sortOrder = 0, blockKey }) {
      const owned = await db
        .prepare(
          `SELECT s.id FROM cms_page_sections s
           JOIN cms_pages p ON s.page_id = p.id
           WHERE s.id = ? AND p.project_slug = ? LIMIT 1`
        )
        .bind(sectionId, projectSlug)
        .first();
      if (!owned) throw new Error(`Section ${sectionId} does not belong to project ${projectSlug}`);

      const type = String(componentType || '').trim();
      if (!type) throw new Error('cms_block_type_required');
      const { account_id: accountId } = await resolveSite();
      const blockId = `cmsb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      await db
        .prepare(
          `INSERT INTO cms_section_blocks (
            id, account_id, section_id, block_key, block_type, sort_order, status, content_json
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .bind(blockId, accountId, sectionId, toBlockKey(blockKey, type), type, sortOrder, toJsonObjectString(componentData, 'component_data'))
        .run();

      return this.getBlockById(blockId);
    },

    async updateBlock(blockId, updates = {}) {
      const existing = await this.getBlockById(blockId);
      if (!existing) throw new Error(`Block ${blockId} does not belong to project ${projectSlug}`);

      const type = updates.component_type !== undefined ? String(updates.component_type).trim() : existing.block_type;
      if (!type) throw new Error('cms_block_type_required');
      const content = updates.component_data !== undefined
        ? toJsonObjectString(updates.component_data, 'component_data')
        : existing.content_json;
      const settings = updates.settings_json !== undefined
        ? toJsonObjectString(updates.settings_json, 'settings_json')
        : existing.settings_json;

      await db
        .prepare(
          `UPDATE cms_section_blocks
           SET block_type = ?, content_json = ?, settings_json = ?, updated_at = datetime('now')
           WHERE id = ? AND section_id IN (
             SELECT s.id FROM cms_page_sections s
             JOIN cms_pages p ON s.page_id = p.id
             WHERE p.project_slug = ?
           )`
        )
        .bind(type, content, settings, blockId, projectSlug)
        .run();

      return this.getBlockById(blockId);
    },

    async deleteBlock(blockId) {
      const existing = await this.getBlockById(blockId);
      if (!existing) throw new Error(`Block ${blockId} not found for project ${projectSlug}`);

      // Child blocks go with it via parent_block_id ON DELETE CASCADE.
      await db
        .prepare(
          `DELETE FROM cms_section_blocks
           WHERE id = ? AND section_id IN (
             SELECT s.id FROM cms_page_sections s
             JOIN cms_pages p ON s.page_id = p.id
             WHERE p.project_slug = ?
           )`
        )
        .bind(blockId, projectSlug)
        .run();
    },

    async setBlockVisibility(blockId, isVisible) {
      await db
        .prepare(
          `UPDATE cms_section_blocks
           SET status = ?, updated_at = datetime('now')
           WHERE id = ? AND status <> 'archived' AND section_id IN (
             SELECT s.id FROM cms_page_sections s
             JOIN cms_pages p ON s.page_id = p.id
             WHERE p.project_slug = ?
           )`
        )
        .bind(isVisible ? 'active' : 'hidden', blockId, projectSlug)
        .run();

      return this.getBlockById(blockId);
    },

    async reorderBlocks(orderList) {
      const statements = [];
      for (const item of orderList || []) {
        if (!item?.id) continue;
        statements.push(
          db
            .prepare(
              `UPDATE cms_section_blocks
               SET sort_order = ?, updated_at = datetime('now')
               WHERE id = ? AND section_id IN (
                 SELECT s.id FROM cms_page_sections s
                 JOIN cms_pages p ON s.page_id = p.id
                 WHERE p.project_slug = ?
               )`
            )
            .bind(Number(item.sort_order || 0), item.id, projectSlug)
        );
      }
      if (statements.length) await db.batch(statements);
    },

    async getThemeOverrides() {
      const res = await db
        .prepare('SELECT * FROM cms_site_theme_overrides WHERE project_slug = ? ORDER BY updated_at DESC LIMIT 1')
        .bind(projectSlug)
        .all();
      return res.results?.[0] || null;
    },

    async saveThemeOverrides(vars, actorUserId = null) {
      const varsJson = toJsonObjectString(vars, 'vars');
      const now = Math.floor(Date.now() / 1000);
      const site = await resolveSite();

      // workspace_id is NOT NULL and part of the current PK; '' means "no workspace"
      // until the overrides table is re-keyed on site_id alone.
      await db
        .prepare(
          `INSERT INTO cms_site_theme_overrides (
            site_id, workspace_id, project_slug, vars_json, updated_by, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, workspace_id, project_slug)
          DO UPDATE SET vars_json = excluded.vars_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
        )
        .bind(site.site_id, site.workspace_id || '', projectSlug, varsJson, actorUserId, now)
        .run();

      return this.getThemeOverrides();
    },

    async getLiquidImports() {
      const sanitizedSlug = projectSlug.replace(/[^a-zA-Z0-9_]/g, '_');
      const res = await db
        .prepare('SELECT * FROM cms_liquid_imports WHERE project_id = ? OR project_id = ? ORDER BY created_at DESC')
        .bind(projectSlug, `proj_${sanitizedSlug}`)
        .all();
      return res.results || [];
    },

    async getActivity() {
      const res = await db
        .prepare(
          `SELECT a.* FROM cms_activity_log a
           WHERE a.resource_id IN (SELECT id FROM cms_pages WHERE project_slug = ?)
           ORDER BY a.created_at DESC LIMIT 20`
        )
        .bind(projectSlug)
        .all();
      return res.results || [];
    },

    async getTemplates() {
      const res = await db
        .prepare(`SELECT * FROM cms_component_templates
           WHERE is_system = 1 OR sku IN (
             SELECT s.template_sku FROM cms_page_sections s
             JOIN cms_pages p ON p.id = s.page_id
             WHERE p.project_slug = ? AND s.template_sku IS NOT NULL
           ) ORDER BY sort_order ASC LIMIT 50`)
        .bind(projectSlug)
        .all();
      return res.results || [];
    },
  };
}
