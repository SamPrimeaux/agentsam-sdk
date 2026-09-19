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

export function createCmsDbClient(db, rawProjectSlug) {
  const projectSlug = assertProjectSlug(rawProjectSlug);

  return {
    projectSlug,

    async getProject() {
      const res = await db
        .prepare('SELECT * FROM projects WHERE id = ? OR name = ? OR client_name = ? LIMIT 1')
        .bind(`proj_${projectSlug.replace(/[^a-zA-Z0-9_]/g, '_')}`, projectSlug, projectSlug)
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
          `SELECT b.* FROM cms_section_components b
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
          `SELECT b.* FROM cms_section_components b
           JOIN cms_page_sections s ON b.section_id = s.id
           JOIN cms_pages p ON s.page_id = p.id
           WHERE b.section_id = ? AND p.project_slug = ?
           ORDER BY b.sort_order ASC`
        )
        .bind(sectionId, projectSlug)
        .all();
      return res.results || [];
    },

    async createPage({ id, title, slug, routePath, pageType, status = 'draft', tenantId = 'tenant_sam_primeaux' }) {
      const pageId = id || `page_${projectSlug}_${slug}_${Date.now().toString(36)}`;
      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          `INSERT INTO cms_pages (
            id, project_id, project_slug, tenant_id, slug, path, route_path,
            page_type, title, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          pageId,
          `proj_${projectSlug.replace(/[^a-zA-Z0-9_]/g, '_')}`,
          projectSlug,
          tenantId,
          slug,
          routePath,
          routePath,
          pageType,
          title,
          status,
          now,
          now
        )
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

    async createBlock({ sectionId, componentType, componentData = {}, sortOrder = 0, tenantId = 'tenant_sam_primeaux' }) {
      const sectionCheck = await db
        .prepare(
          `SELECT s.id FROM cms_page_sections s
           JOIN cms_pages p ON s.page_id = p.id
           WHERE s.id = ? AND p.project_slug = ?`
        )
        .bind(sectionId, projectSlug)
        .all();

      if (!sectionCheck.results?.length) {
        throw new Error(`Section ${sectionId} does not belong to project ${projectSlug}`);
      }

      const blockId = `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const dataStr = typeof componentData === 'string' ? componentData : JSON.stringify(componentData);

      await db
        .prepare(
          `INSERT INTO cms_section_components (
            id, section_id, component_type, component_data, sort_order, is_visible, tenant_id, project_id
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .bind(blockId, sectionId, componentType, dataStr, sortOrder, tenantId, `proj_${projectSlug}`)
        .run();

      const res = await db.prepare('SELECT * FROM cms_section_components WHERE id = ?').bind(blockId).all();
      return res.results?.[0] || null;
    },

    async updateBlock(blockId, updates) {
      const blockCheck = await db
        .prepare(
          `SELECT b.* FROM cms_section_components b
           JOIN cms_page_sections s ON b.section_id = s.id
           JOIN cms_pages p ON s.page_id = p.id
           WHERE b.id = ? AND p.project_slug = ?`
        )
        .bind(blockId, projectSlug)
        .all();

      const existing = blockCheck.results?.[0];
      if (!existing) throw new Error(`Block ${blockId} does not belong to project ${projectSlug}`);

      const componentData = updates.component_data !== undefined
        ? (typeof updates.component_data === 'string' ? updates.component_data : JSON.stringify(updates.component_data))
        : existing.component_data;
      const componentType = updates.component_type !== undefined ? updates.component_type : existing.component_type;

      await db
        .prepare(
          `UPDATE cms_section_components
           SET component_type = ?, component_data = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(componentType, componentData, blockId)
        .run();

      const updated = await db.prepare('SELECT * FROM cms_section_components WHERE id = ?').bind(blockId).all();
      return updated.results?.[0] || null;
    },

    async setBlockVisibility(blockId, isVisible) {
      await db
        .prepare(
          `UPDATE cms_section_components
           SET is_visible = ?, updated_at = datetime('now')
           WHERE id = ? AND section_id IN (
             SELECT s.id FROM cms_page_sections s
             JOIN cms_pages p ON s.page_id = p.id
             WHERE p.project_slug = ?
           )`
        )
        .bind(isVisible ? 1 : 0, blockId, projectSlug)
        .run();

      const updated = await db.prepare('SELECT * FROM cms_section_components WHERE id = ?').bind(blockId).all();
      return updated.results?.[0] || null;
    },

    async reorderBlocks(orderList) {
      for (const item of orderList) {
        if (!item?.id) continue;
        await db
          .prepare(
            `UPDATE cms_section_components
             SET sort_order = ?, updated_at = datetime('now')
             WHERE id = ? AND section_id IN (
               SELECT s.id FROM cms_page_sections s
               JOIN cms_pages p ON s.page_id = p.id
               WHERE p.project_slug = ?
             )`
          )
          .bind(Number(item.sort_order || 0), item.id, projectSlug)
          .run();
      }
    },

    async getThemeOverrides() {
      const res = await db
        .prepare('SELECT * FROM cms_site_theme_overrides WHERE project_slug = ? LIMIT 1')
        .bind(projectSlug)
        .all();
      return res.results?.[0] || null;
    },

    async saveThemeOverrides(vars, userId = 'usr_sam_primeaux') {
      const varsJson = typeof vars === 'string' ? vars : JSON.stringify(vars);
      const now = Math.floor(Date.now() / 1000);

      await db
        .prepare(
          `INSERT INTO cms_site_theme_overrides (
            tenant_id, workspace_id, project_slug, vars_json, updated_by, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, workspace_id, project_slug)
          DO UPDATE SET vars_json = excluded.vars_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
        )
        .bind('tenant_sam_primeaux', 'ws_inneranimalmedia', projectSlug, varsJson, userId, now)
        .run();

      return this.getThemeOverrides();
    },

    async getLiquidImports() {
      const res = await db
        .prepare('SELECT * FROM cms_liquid_imports WHERE tenant_id = ? OR project_id = ? ORDER BY created_at DESC')
        .bind('tenant_sam_primeaux', `proj_${projectSlug}`)
        .all();
      return res.results || [];
    },

    async getActivity() {
      const res = await db
        .prepare('SELECT * FROM cms_activity_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20')
        .bind('tenant_sam_primeaux')
        .all();
      return res.results || [];
    },

    async getTemplates() {
      const res = await db
        .prepare('SELECT * FROM cms_component_templates WHERE is_system = 1 OR iam_project_slug = ? ORDER BY sort_order ASC LIMIT 50')
        .bind(projectSlug)
        .all();
      return res.results || [];
    },

    /**
     * Seeds initial pages and sections if none exist for agentsam-sdk.
     */
    async ensureSeeded() {
      if (projectSlug !== 'agentsam-sdk') return;
      const existing = await this.getPages();
      if (existing.length > 0) return;

      const pageId = 'page_agentsam_sdk_home';
      const now = Math.floor(Date.now() / 1000);

      await db
        .prepare(
          `INSERT INTO cms_pages (
            id, project_id, project_slug, tenant_id, slug, path, route_path,
            page_type, title, status, is_homepage, is_active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`
        )
        .bind(
          pageId,
          'proj_agentsam_sdk',
          'agentsam-sdk',
          'tenant_sam_primeaux',
          'home',
          '/',
          '/',
          'home',
          'Agent Sam SDK',
          'published',
          now,
          now
        )
        .run();

      const sections = [
        { id: 'sec_as_header', type: 'header', name: 'SiteHeader', sort: 10, data: { title: 'Agent Sam', nav_links: [{ label: 'Work', href: '/work' }, { label: 'About', href: '/about' }, { label: 'Services', href: '/services' }, { label: 'Contact', href: '/contact' }] } },
        { id: 'sec_as_hero', type: 'hero', name: 'Hero', sort: 20, data: { headline: 'Developer SDK & Platform', subline: 'Sandboxes, CLI tools, and agent workflows for AI development', cta_text: 'Get Started', cta_href: '/agentsam' } },
        { id: 'sec_as_projects', type: 'project_grid', name: 'ProjectGrid', sort: 30, data: { title: 'Featured Applications', limit: 6 } },
        { id: 'sec_as_about', type: 'about', name: 'About', sort: 40, data: { title: 'Built for High-Velocity Teams', description: 'Autonomous coding, spatial CAD, and real-time evaluation.' } },
        { id: 'sec_as_skills', type: 'skills', name: 'Skills', sort: 50, data: { title: 'Capabilities & Tooling' } },
        { id: 'sec_as_contact', type: 'contact', name: 'Contact', sort: 60, data: { title: "Let's Build Together", email: 'hey@inneranimalmedia.com' } },
        { id: 'sec_as_footer', type: 'footer', name: 'SiteFooter', sort: 70, data: { copyright: '© 2026 Inner Animal Media' } },
      ];

      for (const s of sections) {
        await db
          .prepare(
            `INSERT INTO cms_page_sections (
              id, page_id, section_type, section_name, section_data, sort_order, is_visible
            ) VALUES (?, ?, ?, ?, ?, ?, 1)`
          )
          .bind(s.id, pageId, s.type, s.name, JSON.stringify(s.data), s.sort)
          .run();
      }
    },
  };
}
