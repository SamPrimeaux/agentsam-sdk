/**
 * Optional Canvas handoff to the existing CMS project/revision owner.
 * No publication, site creation, copied website store, or model-authored code.
 */
import { resolveCmsSite } from '../../../ecommerce-cms-agentsam/backend/cms/site-context.mjs';
import { createThemeProject, getThemeProject, validateThemeProjectPayload } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';

const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const NODE_TYPES = new Set(['frame', 'text', 'button', 'image', 'input', 'link']);
const STYLE_PROPERTIES = new Set([
  'background', 'backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight',
  'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'textDecoration',
  'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'boxShadow',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'opacity', 'objectFit', 'objectPosition', 'display', 'alignItems', 'justifyContent',
  'flexDirection', 'gap', 'overflow', 'whiteSpace',
]);
const UNITLESS = new Set(['fontWeight', 'lineHeight', 'opacity']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const cssName = key => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const px = value => Math.max(0, Number(value) || 0) + 'px';
const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
});
const failure = (error, status) => Object.assign(new Error(error), { status });
const validId = value => typeof value === 'string' && SAFE_ID.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);

export function safeCanvasCmsUrl(value, { media = false } = {}) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\\]/.test(value) || value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  if (!media && value.startsWith('#')) return value.length > 1;
  try {
    const url = new URL(value);
    return !url.username && !url.password &&
      (url.protocol === 'https:' || (!media && ['http:', 'mailto:', 'tel:'].includes(url.protocol)));
  } catch { return false; }
}

function styleValue(key, value) {
  if (!STYLE_PROPERTIES.has(key)) return null;
  const text = typeof value === 'number' ? String(value) + (UNITLESS.has(key) || value === 0 ? '' : 'px') : String(value);
  if (!text || text.length > 400 || /[<>{};\\]|url\s*\(|expression\s*\(|@import/i.test(text)) return null;
  return text;
}
function slug(value, fallback) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 50) || fallback;
}
function pageRoutes(boards) {
  const seen = new Set();
  return boards.map((board, index) => {
    const base = board.route === '/' ? 'home' : board.route?.slice(1) ||
      (index === 0 ? 'home' : slug(board.name, 'page-' + (index + 1)));
    let name = base, suffix = 2;
    while (seen.has(name)) name = base + '-' + suffix++;
    seen.add(name);
    return { id: board.id, slug: name, href: name === 'home' ? '/' : '/' + name };
  });
}

export function inspectCanvasCmsCompatibility(document) {
  const issues = [];
  const issue = (code, message, node, severity = 'error') =>
    issues.push({ severity, code, ...(node?.id ? { node_id: node.id } : {}), message });
  const boards = Array.isArray(document?.artboards) ? document.artboards : [];
  let sectionCount = 0, blockCount = 0, nodeCount = 0;
  if (!boards.length || boards.length > 80) issue('pages_required', 'Create between one and 80 artboards before converting.');
  if (document?.host && !['web', 'canvas', 'design', 'app', 'commerce', 'website', 'work', 'agent', 'agentsam', 'online-store'].includes(document.host))
    issue('specialist_document', 'This specialist document needs its native export rather than a CMS website.');
  if ((document?.dataRequirements || []).length)
    issue('data_requirements_unmapped', 'Resolve backend data requirements through a supported CMS component before converting.');
  const routes = pageRoutes(boards), targets = new Map(routes.map(route => [route.id, route.href]));
  const ids = new Set(), boardIds = new Set(), boardRoutes = new Set();
  function inspect(node, depth = 0) {
    if (++nodeCount > 5000 || depth > 30) { issue('document_too_complex', 'Reduce the document before conversion.'); return; }
    if (!node || !validId(node.id) || ids.has(node.id)) {
      issue('node_identity_invalid', 'Every editable object needs a unique stable identity.', node); return;
    }
    ids.add(node.id);
    if (!NODE_TYPES.has(node.type)) issue('node_type_unmapped', 'This object type has no CMS mapping.', node);
    if (node.binding != null) issue('data_binding_unmapped', 'This data binding has no verified CMS runtime mapping.', node);
    if (node.action) {
      if (node.action.type !== 'navigate')
        issue('interaction_unmapped', 'This interaction needs a supported CMS application component.', node);
      else if (!targets.has(node.action.target) && !safeCanvasCmsUrl(node.action.target))
        issue('navigation_target_invalid', 'Choose a valid page, anchor, or link destination.', node);
    }
    if (['button', 'link'].includes(node.type) && !node.action)
      issue('action_missing', 'Connect this action to a destination before converting.', node);
    if (node.type === 'input') issue('form_handler_unmapped', 'Connect this input through a supported CMS form component before converting.', node);
    if (node.type === 'image' && !safeCanvasCmsUrl(node.src, { media: true }))
      issue('image_source_unavailable', 'Choose a persistent HTTPS or site media URL.', node);
    for (const [key, value] of Object.entries(node.style || {})) {
      if (styleValue(key, value) == null)
        issue('style_unmapped', 'Unsupported or unsafe style: ' + key + '.', node);
    }
    for (const value of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(node[value]) || (['width', 'height'].includes(value) && node[value] < 0))
        issue('geometry_invalid', 'The object has invalid layout dimensions.', node);
    }
    for (const child of node.children || []) inspect(child, depth + 1);
  }
  for (const board of boards) {
    if (boardIds.has(board.id)) issue('artboard_identity_duplicate', 'Artboards need unique identities.', board);
    boardIds.add(board.id);
    if (board.route != null && (!/^\/(?:[a-z][a-z0-9-]{0,63})?$/.test(board.route) || boardRoutes.has(board.route)))
      issue('page_route_unmapped', 'The CMS target requires distinct single-level page routes.', board);
    if (board.route) boardRoutes.add(board.route);
    if (board.background && styleValue('background', board.background) == null)
      issue('artboard_background_unmapped', 'Choose a safe artboard background.', board);
    if (!validId(board.id) || !Number.isFinite(board.width) || board.width <= 0 ||
        !Number.isFinite(board.height) || board.height <= 0)
      issue('artboard_invalid', 'Every artboard needs a valid identity and size.', board);
    if (!Array.isArray(board.nodes) || !board.nodes.length) issue('artboard_empty', 'Add content to every artboard before converting.', board);
    if ((board.nodes || []).length > 120) issue('section_limit', 'A CMS page supports at most 120 sections.', board);
    for (const node of board.nodes || []) {
      sectionCount++;
      blockCount += (node.children || []).length;
      inspect(node);
    }
  }
  for (const [key, value] of Object.entries(document?.tokens || {}))
    if (!/^--[a-zA-Z0-9-]+$/.test(key) || typeof value !== 'string' || /[<>{};\\]|url\s*\(/i.test(value))
      issue('token_unmapped', 'Design token ' + key + ' is not a safe CSS custom property.');
  return {
    compatible: !issues.some(item => item.severity === 'error'), issues,
    mapping: { page_count: boards.length, section_count: sectionCount, block_count: blockCount },
    capabilities: {
      owner: 'ecommerce-cms-agentsam', format: 'agentsam.theme-project.v1',
      editable_sections: true, editable_blocks: true, responsive_reflow: true,
      navigation: true, script_execution: false, dynamic_bindings: false,
      automatic_publication: false,
    },
  };
}

function field(key, label, binding, type = 'text', group = 'Content') {
  return { key, label, type, group, binding };
}
function renderEditableNode(node, parentWidth, fields, content, targets, { section = false } = {}) {
  const key = 'node_' + node.id;
  const semanticTag = node.type === 'image' ? 'img' :
    node.action?.type === 'navigate' ? 'a' :
    node.type === 'text' ? 'p' : section ? 'section' : 'div';
  const target = targets.get(node.action?.target) || node.action?.target;
  const attrs = [
    'data-canvas-node="' + esc(node.id) + '"',
    'data-theme-project-field="' + esc(key) + '"',
    'data-cms="' + esc(key) + '"',
  ];
  if (section) attrs.push('data-theme-section="' + esc(node.id) + '"');
  const style = {
    position: section ? 'relative' : 'absolute',
    left: section ? '0' : (node.x / Math.max(1, parentWidth) * 100) + '%',
    top: section ? '0' : px(node.y),
    width: section ? '100%' : (node.width / Math.max(1, parentWidth) * 100) + '%',
    'min-height': px(node.height),
    'box-sizing': 'border-box', 'min-width': '0',
  };
  if (node.type === 'image') style.height = px(node.height);
  const contentKey = key + '_text';
  if (node.text != null) {
    content[contentKey] = node.text;
    fields.push(field(contentKey, node.name || 'Text', { field: contentKey }));
  }
  if (node.type === 'image') {
    attrs.push('src="' + esc(node.src) + '"', 'alt="' + esc(node.name || '') + '"');
    content[key + '_src'] = node.src;
    content[key + '_alt'] = node.name || '';
    fields.push(field(key + '_src', 'Image', { field: key, attribute: 'src' }, 'media', 'Media'));
    fields.push(field(key + '_alt', 'Alternative text', { field: key, attribute: 'alt' }, 'text', 'Accessibility'));
  }
  if (target) {
    attrs.push('href="' + esc(target) + '"');
    content[key + '_href'] = target;
    fields.push(field(key + '_href', 'Link destination', { field: key, attribute: 'href' }, 'link', 'Actions'));
  }
  for (const [property, value] of Object.entries(node.style || {})) {
    const css = cssName(property), normalized = styleValue(property, value);
    style[css] = normalized;
    const setting = key + '_' + property;
    content[setting] = normalized;
    fields.push(field(setting, (node.name || 'Object') + ' · ' + css,
      { field: key, styleProperty: css }, 'text', 'Appearance'));
  }
  attrs.push('style="' + esc(Object.entries(style).map(([k, v]) => k + ':' + v).join(';')) + '"');
  const open = '<' + semanticTag + ' ' + attrs.join(' ') + '>';
  if (semanticTag === 'img') return open;
  return open + (node.text != null ? '<span data-theme-project-field="' + esc(contentKey) + '">' + esc(node.text) + '</span>' : '') +
    (node.children || []).map(child => renderEditableNode(child, node.width, fields, content, targets)).join('') +
    '</' + semanticTag + '>';
}

export function canvasToThemeProject(document, source, projectId) {
  const validation = inspectCanvasCmsCompatibility(document);
  if (!validation.compatible) throw Object.assign(failure('canvas_cms_incompatible', 422), { validation });
  const routes = pageRoutes(document.artboards), targets = new Map(routes.map(route => [route.id, route.href]));
  const pages = document.artboards.map((board, pageIndex) => {
    const sections = board.nodes.map((node, sectionIndex) => {
      const fields = [], content = { __editor: { visibility: { enabled: true }, blocks: [], templateKey: node.id } };
      const blocks = (node.children || []).map(child => {
        const values = {}, blockFields = [];
        const html = renderEditableNode(child, node.width, blockFields, values, targets);
        content[child.id] = values;
        content.__editor.blocks.push({ id: child.id, templateKey: child.id });
        return { key: child.id, label: child.name || child.type, kind: child.children?.length ? 'group' : 'block',
          html, fields: blockFields, settings: [], defaults: values,
          capabilities: { duplicate: true, reorder: true, reusable: true } };
      });
      let html = renderEditableNode({ ...node, children: [] }, board.width, fields, content, targets, { section: true });
      const blockMarkup = blocks.map(block => '<!--theme-block:' + block.key + '-->').join('');
      if (blockMarkup) html = html.replace(/<\/(section|div|a|p)>$/, blockMarkup + '</$1>');
      const name = node.name || 'Section ' + (sectionIndex + 1);
      return { key: node.id, name, sourceKind: slug(name, 'composition'),
        html, content, zone: 'BODY', status: 'draft', version: 0, sort_order: sectionIndex,
        provenance: { ...source, node_id: node.id },
        schema: { key: node.id, label: name, fields, settings: [], blocks,
          capabilities: { duplicate: true, reorder: true, reusable: true } } };
    });
    // Intrinsic reflow avoids shrinking an entire artboard into illegible text.
    // All authored selectors remain inside this page or a placed section.
    const pageId = 'canvas-page-' + board.id;
    const styles = '#' + pageId + '{margin:0 auto;max-width:' + px(board.width) + ';width:100%;overflow-wrap:anywhere;background:' + (board.background || 'transparent') + '}' +
      '#' + pageId + ' [data-theme-section]{max-width:100%}' +
      '#' + pageId + ' img{max-width:100%;object-fit:cover}' +
      '@media(max-width:640px){#' + pageId + ' [data-canvas-node]{position:relative!important;left:auto!important;top:auto!important;width:auto!important;max-width:100%;min-height:0!important;height:auto!important;white-space:normal!important}' +
      '#' + pageId + ' [data-theme-section]{padding:24px 18px!important}' +
      '#' + pageId + ' [data-canvas-node] [data-canvas-node]{margin:12px 0}' +
      '#' + pageId + ' img{width:100%!important}' +
      '#' + pageId + ' p{font-size:clamp(1rem,5vw,2.5rem)!important}}';
    return { slug: routes[pageIndex].slug, title: board.name || 'Page ' + (pageIndex + 1), status: 'draft',
      sourceArtboardId: board.id, sections,
      template: '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        esc(board.name || document.name) + '</title><style>' + styles + '</style></head><body style="margin:0"><main id="' +
        pageId + '">' + sections.map(section => '<!--theme-section:' + section.key + '-->').join('') + '</main></body></html>' };
  });
  return validateThemeProjectPayload({
    schema: 'agentsam.theme-project.v1', id: projectId,
    name: String(document.name || 'Canvas').slice(0, 148) + ' — Draft',
    version: '0.1.0', status: 'draft', tokens: structuredClone(document.tokens || {}),
    sourceCanvas: { ...source }, sourceProvenance: structuredClone(document.provenance || {}),
    pages, media: structuredClone(document.assets || []),
  });
}

export async function createCanvasCmsDraft(env, actor, snapshot, siteId) {
  const site = await resolveCmsSite(env.DB, { accountId: actor, siteId });
  if (site.status === 'archived') throw failure('site_not_found_or_unauthorized', 404);
  const source = { id: snapshot.canvas.id, revision: snapshot.canvas.revision, content_hash: snapshot.canvas.contentHash };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    [source.id, source.revision, source.content_hash].join(':')));
  const suffix = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const projectId = 'canvas_' + suffix;
  const project = canvasToThemeProject(snapshot.document, source, projectId);
  const prior = await getThemeProject(env, actor, projectId, site.id);
  let result = prior;
  if (!prior.ok) {
    if (prior.status !== 404) throw failure(prior.error, prior.status || 503);
    result = await createThemeProject(env, actor, project, site.id);
    if (!result.ok && result.error === 'theme_project_exists')
      result = await getThemeProject(env, actor, projectId, site.id);
  }
  if (!result.ok) throw failure(result.error || 'cms_draft_create_failed', result.status || 503);
  const actual = result.project.sourceCanvas;
  if (actual?.id !== source.id || actual.revision !== source.revision || actual.content_hash !== source.content_hash)
    throw failure('canvas_cms_conversion_conflict', 409);
  return { ok: true, site_id: site.id, project_id: projectId, revision: result.project.revision,
    editor_url: '/admin/theme-project-editor?project=' + projectId + '&site_id=' + encodeURIComponent(site.id),
    source, published: false, unchanged: prior.ok || result.unchanged === true };
}

export async function handleCanvasCms(request, env, actor, canvasId, action) {
  if (!actor) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!['validate', 'convert'].includes(action)) return json({ ok: false, error: 'not_found' }, 404);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ ok: false, error: 'origin_not_allowed' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return json({ ok: false, error: 'json_content_type_required' }, 415);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['site_id', 'expected_revision'].includes(key)) ||
      !validId(body.site_id) || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 1)
    return json({ ok: false, error: 'conversion_request_invalid' }, 400);
  try {
    if (!env.DB || !env.WEBSITE_ASSETS) throw failure('cms_storage_unavailable', 503);
    const { readCanvas } = await import('./work-canvas.js');
    const snapshot = await readCanvas(env, actor, canvasId);
    if (!snapshot) throw failure('canvas_not_found', 404);
    if (snapshot.canvas.revision !== body.expected_revision)
      return json({ ok: false, error: 'canvas_revision_conflict', revision: snapshot.canvas.revision }, 409);
    const site = await resolveCmsSite(env.DB, { accountId: actor, siteId: body.site_id });
    if (site.status === 'archived') throw failure('site_not_found_or_unauthorized', 404);
    const validation = inspectCanvasCmsCompatibility(snapshot.document);
    const source = { id: canvasId, revision: snapshot.canvas.revision, content_hash: snapshot.canvas.contentHash };
    if (action === 'validate') return json({ ok: true, ...validation, source });
    if (!validation.compatible) return json({ ok: false, error: 'canvas_cms_incompatible', ...validation, source }, 422);
    const result = await createCanvasCmsDraft(env, actor, snapshot, site.id);
    return json(result, result.unchanged ? 200 : 201);
  } catch (error) {
    const message = String(error?.message || error);
    const status = /site.*not_found|account_required|access_denied/.test(message) ? 404 : error.status || 503;
    return json({ ok: false, error: status === 503 ? 'cms_conversion_unavailable' : message }, status);
  }
}
