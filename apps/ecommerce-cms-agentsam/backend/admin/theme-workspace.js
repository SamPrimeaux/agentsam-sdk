import { renderSection, presetLibraryFrom } from "@inneranimalmedia/section-library";
import { reviseShowcasePresets } from "@inneranimalmedia/revise-theme/showcase";
import { getStoreTheme } from "./themes.js";
import { buildFnfReviseDraft, fnfReviseMedia, fnfReviseShell } from "../themes/revise-fnf.js";

const REVISE_PRESETS = presetLibraryFrom(reviseShowcasePresets);

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function editorSection(entry, pageVersion, status) {
  const content = structuredClone(entry.data || {});
  content.__layout = structuredClone(entry.layout || {});
  content.__editor = {
    templateKey: entry.preset || entry.type || entry.id,
    visibility: { enabled: entry.enabled !== false },
    blocks: [],
  };
  return {
    key: entry.id,
    name: String(entry.type || "section").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    type: entry.type,
    preset: entry.preset,
    variant: entry.variant || null,
    status,
    version: pageVersion,
    content,
  };
}

function canonicalPageFromRow(row) {
  return {
    theme_id: row.theme_id,
    slug: row.slug,
    title: row.title,
    route: row.route,
    document: parseJson(row.document_json, {}),
    media: parseJson(row.media_json, {}),
    shell: parseJson(row.shell_json, {}),
    status: row.status,
    version: Number(row.version || 1),
    updated_at: row.updated_at || null,
  };
}

function toEditorPage(row) {
  const page = canonicalPageFromRow(row);
  return {
    slug: page.slug,
    title: page.title,
    route: page.route,
    status: page.status,
    version: page.version,
    updated_at: page.updated_at,
    sections: (page.document.sections || []).map((entry) => editorSection(entry, page.version, page.status)),
    theme: page.document.theme || "revise",
  };
}

async function selectThemePageRow(env, themeId, slug) {
  return env.DB.prepare(
    `SELECT theme_id, slug, title, route, document_json, media_json, shell_json, status, version, updated_at
     FROM store_theme_pages WHERE theme_id = ? AND slug = ? LIMIT 1`,
  ).bind(themeId, slug).first();
}

async function seedRevisePage(env, theme, slug) {
  if (slug !== "shop" && slug !== "home") return null;
  const doc = buildFnfReviseDraft();
  const title = slug === "home" ? "Home" : "Shop";
  const route = slug === "home" ? "/" : "/shop";

  await env.DB.prepare(
    `INSERT INTO store_theme_pages
      (theme_id, slug, title, route, document_json, media_json, shell_json, status, version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, datetime('now'))
     ON CONFLICT(theme_id, slug) DO NOTHING`,
  ).bind(
    theme.id,
    slug,
    title,
    route,
    JSON.stringify(doc),
    JSON.stringify(fnfReviseMedia),
    JSON.stringify(fnfReviseShell),
  ).run();

  return selectThemePageRow(env, theme.id, slug);
}

export async function ensureThemePage(env, themeRef, slug) {
  const theme = await getStoreTheme(env, themeRef);
  if (!theme) return { error: "Theme not found", status: 404 };

  let row = await selectThemePageRow(env, theme.id, slug);
  if (!row && theme.slug === "revise") row = await seedRevisePage(env, theme, slug);
  if (!row) return { error: "Theme page not found", status: 404 };
  return { ok: true, theme, row, page: toEditorPage(row) };
}

export async function listThemePages(env, themeRef) {
  const theme = await getStoreTheme(env, themeRef);
  if (!theme) return { error: "Theme not found", status: 404 };
  if (theme.slug === "revise") {
    await seedRevisePage(env, theme, "home");
    await seedRevisePage(env, theme, "shop");
  }

  const { results } = await env.DB.prepare(
    `SELECT slug, title, route, status, version, updated_at
     FROM store_theme_pages WHERE theme_id = ? ORDER BY CASE slug WHEN 'home' THEN 0 WHEN 'shop' THEN 1 ELSE 2 END, title ASC`,
  ).bind(theme.id).all();
  return { ok: true, theme, pages: results || [] };
}

export async function getThemePage(env, themeRef, slug) {
  const loaded = await ensureThemePage(env, themeRef, slug);
  if (loaded.error) return loaded;
  return { ok: true, theme: loaded.theme, page: loaded.page };
}

export async function saveThemePage(env, themeRef, slug, payload = {}, actorId = null) {
  const loaded = await ensureThemePage(env, themeRef, slug);
  if (loaded.error) return loaded;
  if (loaded.theme.state === "active" && loaded.theme.editor_mode === "legacy") {
    return { error: "Use the live CMS editor for the active legacy theme", status: 409 };
  }

  const current = canonicalPageFromRow(loaded.row);
  const expected = payload.expected_version == null ? current.version : Number(payload.expected_version);
  if (!Number.isInteger(expected) || expected !== current.version) {
    return {
      error: "This theme draft changed in another tab. Reload before saving.",
      code: "theme_version_conflict",
      status: 409,
      current_version: current.version,
    };
  }

  const updates = new Map((payload.sections || []).map((section) => [section.key, section.content]));
  if (!updates.size) return { ok: true, page: loaded.page };
  const doc = structuredClone(current.document);
  let changed = 0;
  doc.sections = (doc.sections || []).map((entry) => {
    if (!updates.has(entry.id)) return entry;
    changed += 1;
    const incoming = structuredClone(updates.get(entry.id) || {});
    const layout = incoming.__layout && typeof incoming.__layout === "object"
      ? structuredClone(incoming.__layout)
      : entry.layout;
    const enabled = incoming.__editor?.visibility?.enabled !== false;
    delete incoming.__layout;
    delete incoming.__editor;
    return { ...entry, layout, enabled, data: incoming };
  });
  if (!changed) return { error: "No matching sections were supplied", status: 400 };

  const nextVersion = current.version + 1;
  const result = await env.DB.prepare(
    `UPDATE store_theme_pages
     SET document_json = ?, status = 'draft', version = ?, updated_at = datetime('now')
     WHERE theme_id = ? AND slug = ? AND version = ?`,
  ).bind(JSON.stringify(doc), nextVersion, loaded.theme.id, slug, current.version).run();

  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changes !== 1) {
    return { error: "This theme draft changed in another tab. Reload before saving.", code: "theme_version_conflict", status: 409 };
  }

  await env.DB.prepare(
    `INSERT INTO store_theme_events(theme_id,event_type,from_state,to_state,actor_id,metadata_json)
     VALUES (?, 'saved', ?, ?, ?, ?)`,
  ).bind(
    loaded.theme.id,
    loaded.theme.state,
    loaded.theme.state,
    actorId,
    JSON.stringify({ page_slug: slug, version: nextVersion, sections_changed: changed }),
  ).run();

  const fresh = await ensureThemePage(env, loaded.theme.id, slug);
  return { ok: true, page: fresh.page };
}

function renderReviseShell(pageHtml, shell) {
  const announcements = [...(shell.announcement || []), ...(shell.announcement || [])]
    .map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const brand = escapeHtml(shell.brand || "Fuel & Free Time");
  return [
    '<div data-theme="revise" class="revise-demo">',
    '<div class="revise-announcement"><div class="revise-announcement__track">', announcements, '</div></div>',
    '<header class="revise-header" data-revise-header>',
    '<div class="revise-header__left">',
    '<button class="revise-header__control" type="button" aria-label="Open menu"><span class="revise-burger" aria-hidden="true"></span><span>Menu</span></button>',
    '<a class="revise-header__link" href="#fnf-products">Products</a>',
    '<a class="revise-header__link" href="#fnf-stories">Stories</a>',
    '<a class="revise-header__link" href="#fnf-merch-lab">Product ideas</a>',
    '</div>',
    `<a class="revise-header__brand" href="#">${brand}</a>`,
    '<div class="revise-header__right">',
    '<button class="revise-header__control" type="button"><span>Search</span><b aria-hidden="true">⌕</b></button>',
    '<button class="revise-header__control" type="button"><span>Discover</span><b aria-hidden="true">◌</b></button>',
    '<button class="revise-header__control" type="button"><span>Bag</span><b aria-hidden="true">0</b></button>',
    '</div></header>',
    '<main class="revise-demo__main">', pageHtml, '</main>',
    '<footer class="revise-footer"><div class="iam-layout-max iam-safe-inline revise-footer__main">',
    `<div class="revise-footer__brand">${escapeHtml(shell.footerBrand || brand)}</div>`,
    '<div class="revise-footer__col"><strong>Explore</strong><a href="#fnf-products">Products</a><a href="#fnf-campaigns">Campaigns</a><a href="#fnf-stories">Stories</a></div>',
    '<div class="revise-footer__col"><strong>Direction</strong><a href="#fnf-campaigns">Earned Hours</a><a href="#fnf-campaigns">High Octane</a><a href="#fnf-campaigns">Masters</a></div>',
    '</div><div class="iam-layout-max iam-safe-inline revise-footer__bottom">',
    `<span>${escapeHtml(shell.footerNote || "Draft theme preview")}</span><span>Unpublished draft theme</span>`,
    '</div></footer></div>',
  ].join("");
}

export async function renderThemePreview(env, themeRef, slug, overrideSections = null) {
  const loaded = await ensureThemePage(env, themeRef, slug);
  if (loaded.error) return new Response(loaded.error, { status: loaded.status || 404 });
  const canonical = canonicalPageFromRow(loaded.row);
  if (loaded.theme.slug !== "revise") return new Response("Preview renderer unavailable", { status: 501 });

  const media = new Map(Object.entries(canonical.media || {}));
  const overrides = new Map((Array.isArray(overrideSections) ? overrideSections : []).map((section) => [section.key, section.content]));
  const resolveMedia = (key) => {
    const value = String(key || "");
    if (/^(?:https?:)?\/\//i.test(value) || value.startsWith("/")) return value;
    return media.get(value) || null;
  };
  const sectionHtml = (canonical.document.sections || []).filter((entry) => entry.enabled !== false).map((entry) => {
    const preset = REVISE_PRESETS.get(entry.type, entry.preset);
    if (!preset) throw new Error(`Unknown Revise preset: ${entry.type}:${entry.preset}`);
    const local = structuredClone(overrides.get(entry.id) || {});
    const localLayout = local.__layout && typeof local.__layout === "object" ? local.__layout : null;
    const localEnabled = local.__editor?.visibility?.enabled !== false;
    delete local.__layout;
    delete local.__editor;
    if (overrides.has(entry.id) && !localEnabled) return "";
    const html = renderSection({
      ...preset,
      layout: localLayout || entry.layout || preset.layout,
      variant: entry.variant ?? preset.variant,
      data: { ...preset.data, ...(entry.data || {}), ...local },
    }, {
      theme: "revise",
      resolveMedia,
    });
    return html.replace("<section ", `<section data-section-id="${escapeHtml(entry.id)}" `);
  }).join("\n");

  const body = renderReviseShell(sectionHtml, canonical.shell || {});
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(loaded.theme.name)} — ${escapeHtml(canonical.title)} draft</title><link rel="stylesheet" href="/theme-assets/revise/layout.css"><link rel="stylesheet" href="/theme-assets/revise/theme.css"><style>html,body{margin:0}body{background:#0a0a0a}.theme-preview-draft-badge{position:fixed;right:12px;bottom:12px;z-index:9999;background:rgba(8,8,8,.82);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:7px 11px;font:600 11px/1 system-ui;letter-spacing:.04em;backdrop-filter:blur(12px)}</style></head><body>${body}<div class="theme-preview-draft-badge">Revise · Draft ${canonical.version}</div><script type="module">import { enhanceRevise } from '/theme-assets/revise/runtime/enhance.js'; enhanceRevise(document);</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
