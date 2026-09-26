/**
 * Canonical Cloudflare Worker CMS Service for AgentSam Local Studio.
 *
 * Provides full /api/cms/* backend endpoints directly within the local-studio Worker.
 * Strictly uses createCmsDbClient to enforce tenant isolation against shared D1 DB.
 */

import { createCmsDbClient } from './cms-db.js';
import { fetchSitePartial, putSitePartial, injectSitePartials } from './site-partials.js';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function resolveSiteSlug(url, body = {}) {
  const slug =
    url.searchParams.get('site') ||
    url.searchParams.get('project_slug') ||
    url.searchParams.get('project') ||
    url.searchParams.get('project_id')?.replace(/^proj_/, '') ||
    body?.site ||
    body?.project_slug ||
    body?.project_id?.replace(/^proj_/, '');

  const trimmed = slug && String(slug).trim() ? String(slug).trim() : '';
  return trimmed || null;
}

export async function handleCmsWorkerRequest(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, x-user-id',
      },
    });
  }

  let body = null;
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ ok: false, error: 'invalid_json_body' }, 400);
    }
  }

  const siteSlug = resolveSiteSlug(url, body);
  if (!siteSlug) {
    return json({ ok: false, error: 'site_slug_required', detail: 'Pass ?site= or project_slug — no hardcoded default site.' }, 400);
  }
  const dbClient = createCmsDbClient(env.DB, siteSlug);

  try {
    // ── BOOTSTRAP ──
    if (method === 'GET' && url.pathname === '/api/cms/bootstrap') {
      await dbClient.ensureSeeded();

      const [pages, allSections, allBlocks, project, theme, templates, liquidImports] = await Promise.all([
        dbClient.getPages(),
        dbClient.getAllSectionsForSite(),
        dbClient.getAllBlocksForSite(),
        dbClient.getProject(),
        dbClient.getThemeOverrides(),
        dbClient.getTemplates(),
        dbClient.getLiquidImports(),
      ]);

      const sections_by_page = {};
      for (const p of pages) {
        sections_by_page[p.id] = [];
      }
      for (const s of allSections) {
        if (!sections_by_page[s.page_id]) sections_by_page[s.page_id] = [];
        sections_by_page[s.page_id].push(s);
      }

      const blocks_by_section = {};
      for (const b of allBlocks) {
        if (!blocks_by_section[b.section_id]) blocks_by_section[b.section_id] = [];
        blocks_by_section[b.section_id].push(b);
      }

      let parsedThemeVars = {};
      if (theme?.vars_json) {
        try {
          parsedThemeVars = typeof theme.vars_json === 'string' ? JSON.parse(theme.vars_json) : theme.vars_json;
        } catch {}
      }

      const tenantName = project?.name || siteSlug;
      const tenantDomain = project?.domain || url.host;

      return json({
        ok: true,
        project_slug: siteSlug,
        pages,
        sections_by_page,
        blocks_by_section,
        components_by_section: blocks_by_section,
        tenant: {
          name: tenantName,
          domain: tenantDomain,
          primary_color: '#167BFC',
        },
        workspace_label: tenantName,
        public_domain: tenantDomain,
        active_theme: {
          css_vars: parsedThemeVars,
        },
        component_templates: templates,
        liquid_imports: liquidImports,
        home_page: pages.find((p) => p.is_homepage || p.slug === 'home') || pages[0] || null,
        schemas: {
          protocol_version: 1,
          sections: [],
          blocks: [],
        },
      });
    }

    // ── ACTIVITY ──
    if (method === 'GET' && url.pathname === '/api/cms/activity') {
      const activity = await dbClient.getActivity();
      return json({ ok: true, activity });
    }

    // ── PAGES LIST / CREATE ──
    if (url.pathname === '/api/cms/pages') {
      if (method === 'GET') {
        const pages = await dbClient.getPages();
        return json({ ok: true, pages });
      }
      if (method === 'POST') {
        const title = body?.title || 'Untitled';
        const slug = (body?.slug || title.toLowerCase().replace(/\s+/g, '-')).replace(/^\/+/, '');
        const routePath = body?.route_path || `/${slug}`;
        const pageType = body?.page_type || 'interior';
        const status = body?.status || 'draft';
        const page = await dbClient.createPage({ title, slug, routePath, pageType, status });
        return json({ ok: true, page, id: page.id, route_path: page.route_path }, 201);
      }
    }

    // ── PAGE BY ID / UPDATE / PUBLISH ──
    const pagePublishMatch = url.pathname.match(/^\/api\/cms\/pages\/([^/]+)\/publish$/);
    if (pagePublishMatch && method === 'POST') {
      const pageId = decodeURIComponent(pagePublishMatch[1]);
      const page = await dbClient.publishPage(pageId);
      return json({ ok: true, page });
    }

    const pageMatch = url.pathname.match(/^\/api\/cms\/pages\/([^/]+)$/);
    if (pageMatch) {
      const pageId = decodeURIComponent(pageMatch[1]);
      if (method === 'GET') {
        const page = await dbClient.getPageById(pageId);
        if (!page) return json({ ok: false, error: 'page_not_found' }, 404);
        const sections = await dbClient.getSectionsForPage(pageId);
        return json({ ok: true, page, sections });
      }
      if (method === 'PUT') {
        const page = await dbClient.updatePage(pageId, body || {});
        return json({ ok: true, page });
      }
    }

    // ── SECTIONS ──
    if (method === 'POST' && url.pathname === '/api/cms/sections') {
      const section = await dbClient.createSection({
        pageId: body.page_id,
        sectionType: body.section_type || 'section',
        sectionName: body.section_name || 'Section',
        sectionData: body.section_data || {},
        sortOrder: Number(body.sort_order || 0),
      });
      return json({ ok: true, section, id: section.id }, 201);
    }

    if (method === 'POST' && url.pathname === '/api/cms/sections/reorder') {
      const sections = await dbClient.reorderSections(body.page_id, body.order || []);
      return json({ ok: true, sections });
    }

    const sectionVisibilityMatch = url.pathname.match(/^\/api\/cms\/sections\/([^/]+)\/visibility$/);
    if (sectionVisibilityMatch && method === 'POST') {
      const sectionId = decodeURIComponent(sectionVisibilityMatch[1]);
      const section = await dbClient.setSectionVisibility(sectionId, Boolean(body.is_visible));
      return json({ ok: true, section });
    }

    const sectionMatch = url.pathname.match(/^\/api\/cms\/sections\/([^/]+)$/);
    if (sectionMatch && method === 'PUT') {
      const sectionId = decodeURIComponent(sectionMatch[1]);
      const section = await dbClient.updateSection(sectionId, body || {});
      return json({ ok: true, section });
    }

    // ── BLOCKS ──
    if (url.pathname === '/api/cms/blocks') {
      if (method === 'GET') {
        const sectionId = url.searchParams.get('section_id');
        const blocks = await dbClient.getBlocksForSection(sectionId);
        return json({ ok: true, blocks, components: blocks });
      }
      if (method === 'POST') {
        const block = await dbClient.createBlock({
          sectionId: body.section_id,
          componentType: body.type || body.block_type || body.component_type || 'text',
          componentData: body.data || body.block_data || body.component_data || {},
          sortOrder: Number(body.sort_order || 10),
        });
        return json({ ok: true, block, component: block, id: block.id }, 201);
      }
    }

    if (method === 'POST' && url.pathname === '/api/cms/blocks/reorder') {
      await dbClient.reorderBlocks(body.order || []);
      return json({ ok: true });
    }

    const blockVisibilityMatch = url.pathname.match(/^\/api\/cms\/blocks\/([^/]+)\/visibility$/);
    if (blockVisibilityMatch && method === 'POST') {
      const blockId = decodeURIComponent(blockVisibilityMatch[1]);
      const block = await dbClient.setBlockVisibility(blockId, Boolean(body.is_visible));
      return json({ ok: true, block });
    }

    const blockMatch = url.pathname.match(/^\/api\/cms\/blocks\/([^/]+)$/);
    if (blockMatch && method === 'PUT') {
      const blockId = decodeURIComponent(blockMatch[1]);
      const block = await dbClient.updateBlock(blockId, {
        component_data: body.block_data || body.component_data || body.data,
        component_type: body.block_type || body.component_type || body.type,
      });
      return json({ ok: true, block });
    }

    // ── THEME VARS ──
    if (url.pathname === '/api/cms/theme-vars' && (method === 'PATCH' || method === 'PUT')) {
      const theme = await dbClient.saveThemeOverrides(body.vars || {});
      return json({ ok: true, theme });
    }

    // ── ASSETS (WEBSITE_ASSETS R2 code sections) ──
    if (url.pathname === '/api/cms/assets' && method === 'GET') {
      let assets = [];
      const { resolveWebsiteAssets } = await import('./bindings.js');
      const website = resolveWebsiteAssets(env);
      if (website?.binding) {
        try {
          const prefix = `sites/${siteSlug}/`;
          const listed = await website.binding.list({ prefix, limit: 100 });
          assets = (listed.objects || []).map((obj) => ({
            id: obj.key,
            filename: obj.key.split('/').pop(),
            original_filename: obj.key.split('/').pop(),
            mime_type: obj.httpMetadata?.contentType || 'application/octet-stream',
            content_size_bytes: obj.size,
            public_url: `${url.origin}/site/${obj.key.replace(`sites/${siteSlug}/public/`, '')}`,
            binding: website.name,
            role: website.role,
          }));
        } catch {}
      }
      return json({ ok: true, assets });
    }

    // ── TEMPLATES ──
    if (url.pathname === '/api/cms/templates' && method === 'GET') {
      const templates = await dbClient.getTemplates();
      return json({ ok: true, templates });
    }

    // ── PARTIALS (R2 Edge WEBSITE_ASSETS) ──
    const partialMatch = url.pathname.match(/^\/api\/cms\/partials\/([^/]+)$/);
    if (partialMatch) {
      const partialName = decodeURIComponent(partialMatch[1]);
      if (method === 'GET') {
        const content = await fetchSitePartial(env, siteSlug, partialName);
        return json({ ok: true, partial: partialName, site: siteSlug, content: content || '' });
      }
      if (method === 'PUT' || method === 'POST') {
        const content = typeof body?.content === 'string' ? body.content : String(body || '');
        await putSitePartial(env, siteSlug, partialName, content);
        return json({ ok: true, partial: partialName, site: siteSlug });
      }
    }

    // ── RENDER PAGE (with HTMLRewriter edge partial injection) ──
    if (url.pathname === '/api/cms/render-page' && method === 'GET') {
      const pageId = url.searchParams.get('page_id') || url.searchParams.get('id');
      const page = pageId ? await dbClient.getPageById(pageId) : (await dbClient.getPages())[0];
      if (!page) return json({ ok: false, error: 'page_not_found' }, 404);
      const sections = await dbClient.getSectionsForPage(page.id);
      const sectionsHtml = sections
        .filter((s) => s.is_visible)
        .map((s) => `<section id="${s.id}" data-section-type="${s.section_type}" class="cms-section ${s.css_classes || ''}"><h2>${s.section_name}</h2></section>`)
        .join('\n');
      const rawHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${page.title}</title></head><body data-route="${page.route_path}"><main class="cms-main">${sectionsHtml}</main></body></html>`;
      const baseResponse = new Response(rawHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
      return injectSitePartials(baseResponse, env, siteSlug);
    }

    // ── CONTACTS ──
    if (url.pathname === '/api/cms/contacts' && method === 'GET') {
      return json({ ok: true, contacts: [] });
    }

    return json({ ok: false, error: 'cms_route_not_found', path: url.pathname }, 404);
  } catch (err) {
    console.error('CMS Worker Handler Error:', String(err));
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
