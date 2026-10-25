/**
 * R2-backed HTML source authoring for existing Local Studio CMS pages.
 *
 * D1 stores page identity and draft pointer/version. WEBSITE_ASSETS keeps the
 * complete original HTML and immutable private draft revisions; published R2
 * files are NEVER modified by saving an editor draft.
 */
import { resolveWebsiteAssets } from './bindings.js';

const PAGE_SOURCE = /^\/api\/cms\/source\/pages\/([a-z0-9][a-z0-9-]{0,99})(?:\/(draft))?$/;
const HTML_LIMIT = 1024 * 1024;

function response(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
function safeMetadata(value) {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}
function authoredPage(page) {
  const metadata = safeMetadata(page.metadata_json);
  return {
    id: page.id, slug: page.slug, title: page.title, route: page.route_path,
    status: page.status, source_key: page.r2_key, version: Number(metadata.cms_source_version || 0),
    draft_key: metadata.cms_source_draft_key || null,
  };
}
async function sha256(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleCmsSourceRequest({ request, url, body, env, siteSlug, dbClient, ownedSite }) {
  const method = request.method.toUpperCase();
  // A site must have been explicitly authorized upstream by CMS service.
  if (ownedSite?.source !== 'shared-d1') return response({ ok: false, error: 'source_editor_requires_local_site' }, 409);
  const pages = await dbClient.getPages();
  if (method === 'GET' && url.pathname === '/api/cms/source/pages') {
    return response({ ok: true, pages: pages.filter(p => p.is_active !== 0).map(authoredPage) });
  }
  const match = PAGE_SOURCE.exec(url.pathname);
  if (!match) return response({ ok: false, error: 'cms_source_route_not_found' }, 404);
  const [, slug, operation] = match;
  const page = pages.find(p => p.slug === slug && p.is_active !== 0);
  if (!page) return response({ ok: false, error: 'cms_source_page_not_registered' }, 404);
  if (!page.r2_key || !page.r2_bucket) return response({ ok: false, error: 'cms_page_source_unbound' }, 409);
  // The source is editable only when an actual CMS section and source block are registered.
  const sections = await dbClient.getSectionsForPage(page.id);
  const section = sections.find(s => s.section_type === 'html_source');
  if (!section) return response({ ok: false, error: 'cms_html_source_section_not_registered' }, 409);
  const blocks = await dbClient.getBlocksForSection(section.id);
  const block = blocks.find(b => b.block_key === 'document' && b.block_type === 'html');
  if (!block) return response({ ok: false, error: 'cms_html_source_block_not_registered' }, 409);
  // WEBSITE_ASSETS is the installation binding, not a hardcoded bucket.
  const website = resolveWebsiteAssets(env);
  if (!website?.binding) return response({ ok: false, error: 'website_assets_binding_unavailable' }, 503);
  const metadata = safeMetadata(page.metadata_json);
  if (!page.r2_key.startsWith('sites/' + siteSlug + '/public/')) {
    return response({ ok: false, error: 'cms_source_outside_site_scope' }, 409);
  }
  const siteRoot = 'sites/' + siteSlug + '/';
  if (metadata.cms_source_draft_key && !String(metadata.cms_source_draft_key).startsWith(siteRoot + 'cms/drafts/')) {
    return response({ ok: false, error: 'cms_draft_scope_violation' }, 409);
  }
  if (method === 'GET' && !operation) {
    const key = metadata.cms_source_draft_key || page.r2_key;
    const object = await website.binding.get(key);
    if (!object) return response({ ok: false, error: 'cms_r2_source_missing', object_key: key }, 404);
    return response({ ok: true, page: { ...authoredPage(page), section_id: section.id, block_id: block.id },
      html: await object.text(), source: metadata.cms_source_draft_key ? 'draft' : 'published' });
  }
  if (method === 'PUT' && operation === 'draft') {
    if (!ownedSite.can_edit) return response({ ok: false, error: 'cms_source_write_forbidden' }, 403);
    const html = body?.html;
    if (typeof html !== 'string' || !/^\s*<!doctype html|^\s*<html[\s>]/i.test(html) || new TextEncoder().encode(html).byteLength > HTML_LIMIT) {
      return response({ ok: false, error: 'cms_source_full_html_required_or_too_large' }, 400);
    }
    const currentVersion = Number(metadata.cms_source_version || 0);
    const expectedVersion = Number(body?.expected_version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
      return response({ ok: false, error: 'cms_source_version_conflict', version: currentVersion }, 409);
    }
    const nextVersion = currentVersion + 1;
    const hash = await sha256(html);
    const draftKey = siteRoot + 'cms/drafts/' + page.id + '/v' + nextVersion + '-' + hash.slice(0, 16) + '.html';
    await website.binding.put(draftKey, html, { httpMetadata: { contentType: 'text/html; charset=utf-8' },
      customMetadata: { pageId: page.id, kind: 'private-draft', sha256: hash } });
    const nextMetadata = { ...metadata, cms_source_version: nextVersion,
      cms_source_draft_key: draftKey, cms_source_sha256: hash };
    const result = await env.DB.prepare(
      `UPDATE cms_pages SET metadata_json = ?, updated_at = unixepoch()
       WHERE id = ? AND project_slug = ?
       AND COALESCE(CAST(json_extract(metadata_json,'$.cms_source_version') AS INTEGER),0) = ?`
    ).bind(JSON.stringify(nextMetadata), page.id, siteSlug, currentVersion).run();
    if ((result.meta?.changes || 0) !== 1) return response({ ok: false, error: 'cms_source_version_conflict' }, 409);
    const previousKey = metadata.cms_source_draft_key;
    // Safe pruning: only the previous private draft, never the published source.
    if (previousKey && previousKey !== draftKey &&
        String(previousKey).startsWith(siteRoot + 'cms/drafts/')) {
      try { await website.binding.delete(previousKey); } catch { /* Draft saved; a stale private file can be cleaned later. */ }
    }
    return response({ ok: true, version: nextVersion, draft_key: draftKey, sha256: hash, status: 'draft' });
  }
  return response({ ok: false, error: 'cms_source_method_not_allowed' }, 405);
}
