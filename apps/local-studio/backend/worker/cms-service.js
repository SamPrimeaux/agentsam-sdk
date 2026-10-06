/**
 * Canonical Cloudflare Worker CMS Service for AgentSam Local Studio.
 *
 * Provides full /api/cms/* backend endpoints directly within the local-studio Worker.
 * Strictly uses createCmsDbClient to enforce tenant isolation against shared D1 DB.
 */

import { createCmsDbClient } from './cms-db.js';
import { listAuthorizedCmsSites, requireCmsSiteAccess, cmsActorRequired } from './cms-authority.js';
import { handleRemoteCmsRequest } from './cms-remote.js';
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

function safeAssetFilename(value) {
  const raw = String(value || 'asset').trim() || 'asset';
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function assertOwnedAssetKey(siteSlug, key) {
  const normalized = String(key || '');
  const prefix = `sites/${siteSlug}/public/`;
  if (!normalized.startsWith(prefix) || normalized.includes('..')) {
    throw new Error('asset_scope_violation');
  }
  return normalized;
}

function mapR2Asset(url, siteSlug, website, obj) {
  const publicPath = obj.key.replace(`sites/${siteSlug}/public/`, '');
  const metadata = obj.customMetadata || {};
  return {
    id: obj.key,
    filename: obj.key.split('/').pop(),
    original_filename: metadata.originalName || obj.key.split('/').pop(),
    mime_type: obj.httpMetadata?.contentType || 'application/octet-stream',
    content_size_bytes: obj.size,
    public_url: `${url.origin}/site/${publicPath}`,
    metadata: metadata.metadata ? JSON.parse(metadata.metadata) : {},
    binding: website.name,
    role: website.role,
  };
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

export async function handleCmsWorkerRequest(request, env, actorUserId) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // The entry Worker validated the session; never accept an unverified actor
  // from request headers, and do not enable wildcard CORS on authoring APIs.
  try { cmsActorRequired(actorUserId); }
  catch { return json({ ok: false, error: 'unauthorized' }, 401); }
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (url.pathname === '/api/cms/sites' && method === 'GET') {
    const sites = await listAuthorizedCmsSites(env.DB, actorUserId);
    return json({ ok: true, sites });
  }

  let body = null;
  let formData = null;
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const contentType = request.headers.get('content-type') || '';
    try {
      if (contentType.includes('multipart/form-data')) {
        formData = await request.formData();
        body = Object.fromEntries(
          [...formData.entries()].filter(([, value]) => typeof value === 'string'),
        );
      } else {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      }
    } catch {
      return json({ ok: false, error: contentType.includes('multipart/form-data') ? 'invalid_form_body' : 'invalid_json_body' }, 400);
    }
  }

  const siteSlug = resolveSiteSlug(url, body);
  if (!siteSlug) {
    return json({ ok: false, error: 'site_slug_required', detail: 'Pass ?site= or project_slug — no hardcoded default site.' }, 400);
  }
  const access = /\/publish$/.test(url.pathname) ? 'publish' : method === 'GET' ? 'read' : 'write';
  const authorization = await requireCmsSiteAccess(env.DB, actorUserId, siteSlug, access);
  if (!authorization.ok) return json({ ok: false, error: authorization.error }, authorization.status);
  const ownedSite = authorization.site;
  if (ownedSite.source === 'worker') {
    // External site writes pass ONLY through its signed, narrowly scoped
    // Worker bridge; never edit the archived D1 projection in Studio.
    if (url.pathname.startsWith('/api/cms/remote/')) {
      return handleRemoteCmsRequest(request, env, {
        actorUserId, site: ownedSite,
        path: url.pathname.slice('/api/cms/remote/'.length),
      });
    }
    return json({
      ok: false,
      error: 'cms_site_uses_remote_adapter',
      source: 'worker',
      site: siteSlug,
    }, 409);
  }
  if (url.pathname.startsWith('/api/cms/remote/')) {
    return json({ ok: false, error: 'cms_site_uses_shared_d1_adapter' }, 400);
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
        const pageType = body?.page_type || 'custom';
        const status = 'draft';
        const page = await dbClient.createPage({
          title, slug, routePath, pageType, status,
          tenantId: ownedSite.tenant_id,
          projectId: ownedSite.project_id,
        });
        return json({ ok: true, page, id: page.id, route_path: page.route_path }, 201);
      }
    }

    // ── DURABLE PAGE REVISIONS (private WEBSITE_ASSETS R2 snapshots) ──
    const pageRevisionsMatch = url.pathname.match(/^\/api\/cms\/pages\/([^/]+)\/revisions$/);
    if (pageRevisionsMatch) {
      const pageId = decodeURIComponent(pageRevisionsMatch[1]);
      const page = await dbClient.getPageById(pageId);
      if (!page) return json({ ok: false, error: 'page_not_found' }, 404);

      const { resolveWebsiteAssets } = await import('./bindings.js');
      const website = resolveWebsiteAssets(env);
      if (!website?.binding) {
        return json({ ok: false, error: 'website_assets_binding_unavailable' }, 503);
      }
      const prefix = `sites/${siteSlug}/cms/revisions/`;

      if (method === 'GET') {
        const listed = await website.binding.list({
          prefix,
          limit: 1000,
          include: ['customMetadata'],
        });
        const revisions = (listed.objects || [])
          .filter((obj) => obj.customMetadata?.pageId === pageId)
          .map((obj) => ({
            id: obj.key.slice(prefix.length).replace(/\.json$/, ''),
            pageId,
            kind: obj.customMetadata?.kind || 'draft',
            createdAt: obj.customMetadata?.createdAt || obj.uploaded?.toISOString?.() || null,
            label: obj.customMetadata?.label || undefined,
          }))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return json({ ok: true, revisions });
      }

      if (method === 'POST') {
        const revisionId = `rev_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
        const createdAt = new Date().toISOString();
        const kind = body?.kind === 'publication' ? 'publication' : 'draft';
        const record = {
          id: revisionId,
          pageId,
          kind,
          createdAt,
          label: body?.label || undefined,
          snapshot: body?.snapshot ?? {},
        };
        const key = `${prefix}${revisionId}.json`;
        await website.binding.put(key, JSON.stringify(record), {
          httpMetadata: { contentType: 'application/json; charset=utf-8' },
          customMetadata: {
            pageId,
            kind,
            createdAt,
            ...(record.label ? { label: String(record.label) } : {}),
          },
        });
        return json({ ok: true, revision: record }, 201);
      }
    }

    const revisionMatch = url.pathname.match(/^\/api\/cms\/revisions\/([^/]+)$/);
    if (revisionMatch && method === 'GET') {
      const revisionId = decodeURIComponent(revisionMatch[1]).replace(/[^a-zA-Z0-9_-]/g, '');
      const { resolveWebsiteAssets } = await import('./bindings.js');
      const website = resolveWebsiteAssets(env);
      if (!website?.binding) {
        return json({ ok: false, error: 'website_assets_binding_unavailable' }, 503);
      }
      const key = `sites/${siteSlug}/cms/revisions/${revisionId}.json`;
      const object = await website.binding.get(key);
      if (!object) return json({ ok: false, error: 'revision_not_found' }, 404);
      const revision = await object.json();
      return json({ ok: true, revision });
    }

    // ── PAGE BY ID / UPDATE / PUBLISH ──
    const pagePublishMatch = url.pathname.match(/^\/api\/cms\/pages\/([^/]+)\/publish$/);
    if (pagePublishMatch && method === 'POST') {
      // Marking a D1 row 'published' does not publish AgentSam's R2-backed
      // website. Block until real artifact promotion + rollback is installed.
      return json({ ok: false, error: 'cms_publish_requires_renderer_promotion_and_receipt' }, 409);
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
      if (method === 'DELETE') {
        await dbClient.deletePage(pageId);
        return json({ ok: true, deleted: pageId });
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
    if (sectionMatch) {
      const sectionId = decodeURIComponent(sectionMatch[1]);
      if (method === 'PUT') {
        const section = await dbClient.updateSection(sectionId, body || {});
        return json({ ok: true, section });
      }
      if (method === 'DELETE') {
        await dbClient.deleteSection(sectionId);
        return json({ ok: true, deleted: sectionId });
      }
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
    if (blockMatch) {
      const blockId = decodeURIComponent(blockMatch[1]);
      if (method === 'PUT') {
        const block = await dbClient.updateBlock(blockId, {
          component_data: body.block_data || body.component_data || body.data,
          component_type: body.block_type || body.component_type || body.type,
        });
        return json({ ok: true, block });
      }
      if (method === 'DELETE') {
        await dbClient.deleteBlock(blockId);
        return json({ ok: true, deleted: blockId });
      }
    }

    // ── THEME VARS ──
    if (url.pathname === '/api/cms/theme-vars' && (method === 'PATCH' || method === 'PUT')) {
      const theme = await dbClient.saveThemeOverrides(body.vars || {});
      return json({ ok: true, theme });
    }

    // ── ASSETS (WEBSITE_ASSETS R2 authority) ──
    if (url.pathname === '/api/cms/assets') {
      const { resolveWebsiteAssets } = await import('./bindings.js');
      const website = resolveWebsiteAssets(env);
      if (!website?.binding) {
        return json({ ok: false, error: 'website_assets_binding_unavailable' }, 503);
      }

      if (method === 'GET') {
        const prefix = `sites/${siteSlug}/public/`;
        const listed = await website.binding.list({
          prefix,
          limit: 250,
          include: ['httpMetadata', 'customMetadata'],
        });
        const assets = (listed.objects || []).map((obj) => mapR2Asset(url, siteSlug, website, obj));
        return json({ ok: true, assets });
      }

      if (method === 'POST') {
        const file = formData?.get('file');
        if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
          return json({ ok: false, error: 'asset_file_required' }, 400);
        }
        if (Number(file.size || 0) > 25 * 1024 * 1024) {
          return json({ ok: false, error: 'asset_too_large', max_bytes: 25 * 1024 * 1024 }, 413);
        }

        const requestedName = formData?.get('name');
        const originalName = safeAssetFilename(
          typeof requestedName === 'string' && requestedName.trim() ? requestedName : file.name,
        );
        const key = `sites/${siteSlug}/public/media/${Date.now().toString(36)}-${originalName}`;
        let metadata = {};
        const metadataRaw = formData?.get('metadata');
        if (typeof metadataRaw === 'string' && metadataRaw.trim()) {
          try { metadata = JSON.parse(metadataRaw); } catch { return json({ ok: false, error: 'invalid_asset_metadata' }, 400); }
        }

        await website.binding.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type || 'application/octet-stream' },
          customMetadata: {
            originalName,
            metadata: JSON.stringify(metadata),
          },
        });
        const stored = await website.binding.get(key);
        if (!stored) return json({ ok: false, error: 'asset_write_failed' }, 500);
        return json({ ok: true, asset: mapR2Asset(url, siteSlug, website, stored) }, 201);
      }
    }

    const assetMatch = url.pathname.match(/^\/api\/cms\/assets\/(.+)$/);
    if (assetMatch) {
      const { resolveWebsiteAssets } = await import('./bindings.js');
      const website = resolveWebsiteAssets(env);
      if (!website?.binding) {
        return json({ ok: false, error: 'website_assets_binding_unavailable' }, 503);
      }

      const key = assertOwnedAssetKey(siteSlug, decodeURIComponent(assetMatch[1]));
      if (method === 'GET') {
        const object = await website.binding.get(key);
        if (!object) return json({ ok: false, error: 'asset_not_found' }, 404);
        return json({ ok: true, asset: mapR2Asset(url, siteSlug, website, object) });
      }

      if (method === 'DELETE') {
        const object = await website.binding.head(key);
        if (!object) return json({ ok: false, error: 'asset_not_found' }, 404);
        await website.binding.delete(key);
        return json({ ok: true, deleted: key });
      }

      if (method === 'PATCH' || method === 'PUT') {
        const object = await website.binding.get(key);
        if (!object) return json({ ok: false, error: 'asset_not_found' }, 404);

        const currentMeta = object.customMetadata || {};
        const nextName = body?.name ? safeAssetFilename(body.name) : key.split('/').pop();
        const parent = key.slice(0, key.lastIndexOf('/') + 1);
        const nextKey = assertOwnedAssetKey(siteSlug, parent + nextName);
        const nextMetadata = {
          ...currentMeta,
          ...(body?.name ? { originalName: nextName } : {}),
          ...(body?.metadata !== undefined ? { metadata: JSON.stringify(body.metadata || {}) } : {}),
        };

        await website.binding.put(nextKey, await object.arrayBuffer(), {
          httpMetadata: object.httpMetadata,
          customMetadata: nextMetadata,
        });
        if (nextKey !== key) await website.binding.delete(key);
        const stored = await website.binding.get(nextKey);
        return json({ ok: true, asset: mapR2Asset(url, siteSlug, website, stored) });
      }
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
