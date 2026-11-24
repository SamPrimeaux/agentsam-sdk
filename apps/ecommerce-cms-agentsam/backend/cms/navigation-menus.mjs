const REQUIRED_COLUMNS = ["id", "account_id", "site_id", "handle", "title", "items_json", "status", "metadata_json", "created_at", "updated_at"];

function rowsOf(result) { return Array.isArray(result) ? result : result?.results || []; }
async function all(db, sql, ...params) { return rowsOf(await db.prepare(sql).bind(...params).all()); }
async function first(db, sql, ...params) { return await db.prepare(sql).bind(...params).first(); }
async function run(db, sql, ...params) { return await db.prepare(sql).bind(...params).run(); }

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
}

function isSafeHref(value) {
  const href = String(value || "").trim();
  if (!href || href.length > 2048 || /[\u0000-\u001f\\]/.test(href)) return false;
  return (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#") ||
    /^https:\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

function normalizeLink(item, index, depth = 0) {
  if (!item || typeof item !== "object" || Array.isArray(item) || depth > 3) throw new Error("invalid_navigation_item");
  const label = String(item.label ?? item.title ?? item.name ?? "").trim().slice(0, 100);
  const href = String(item.href ?? item.url ?? item.path ?? item.to ?? "").trim();
  if (!label || !isSafeHref(href)) throw new Error("invalid_navigation_item");
  const normalized = { id: String(item.id ?? item.key ?? ("nav-" + (index + 1))).slice(0, 100), label, href };
  if (item.target === "_blank") normalized.target = "_blank";
  if (item.rel) normalized.rel = String(item.rel).slice(0, 120);
  if (Array.isArray(item.children)) normalized.children = item.children.slice(0, 50).map((child, childIndex) => normalizeLink(child, childIndex, depth + 1));
  return normalized;
}

function normalizeItems(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("invalid_navigation_items");
  return value.map((item, index) => normalizeLink(item, index));
}

function normalizeFooterGroups(value) {
  if (!Array.isArray(value) || value.length > 12) throw new Error("invalid_navigation_groups");
  return value.map((group, groupIndex) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) throw new Error("invalid_navigation_group");
    const label = String(group.label ?? group.title ?? "").trim().slice(0, 80);
    if (!label) throw new Error("invalid_navigation_group");
    const items = Array.isArray(group.items) ? group.items : Array.isArray(group.links) ? group.links : [];
    if (items.length > 40) throw new Error("invalid_navigation_group_items");
    return {
      key: String(group.key ?? ("group-" + (groupIndex + 1))).slice(0, 100),
      label,
      items: items.map((item, index) => ({
        ...normalizeLink(item, index),
        ...(Number.isFinite(Number(item.sort_order)) ? { sort_order: Number(item.sort_order) } : {}),
      })),
    };
  });
}

function normalizeHandle(value) {
  const handle = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(handle)) throw new Error("invalid_navigation_handle");
  return handle;
}

function normalizeStatus(value, fallback = "draft") {
  const status = String(value ?? fallback);
  if (!["draft", "active", "archived"].includes(status)) throw new Error("invalid_navigation_status");
  return status;
}

function normalizeMenuPayload(input, current = null) {
  const title = String(input.title ?? current?.title ?? "").trim().slice(0, 120);
  if (!title) throw new Error("navigation_title_required");
  const rawHandle = input.handle ?? current?.handle ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const handle = normalizeHandle(rawHandle);
  const layout = input.layout === "grouped-footer" || current?.layout === "grouped-footer" ? "grouped-footer" : "links";
  const status = normalizeStatus(input.status, current?.status || "draft");
  const metadata = current?.metadata && typeof current.metadata === "object" ? { ...current.metadata } : {};
  if (layout === "grouped-footer") {
    const groups = normalizeFooterGroups(input.groups ?? current?.groups ?? metadata.legacyMenuItems?.groups ?? []);
    metadata.legacyMenuItems = { schema: "iam.cms.footer-menu.v1", groups };
    delete metadata.legacyMenuItemsRaw;
    return { handle, title, layout, status, items: [], groups, metadata };
  }
  const items = normalizeItems(input.items ?? current?.items ?? []);
  delete metadata.legacyMenuItems;
  delete metadata.legacyMenuItemsRaw;
  return { handle, title, layout, status, items, groups: [], metadata };
}

function toMenu(row) {
  const metadata = parseJson(row.metadata_json, {});
  const normalizedMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const items = parseJson(row.items_json, []);
  const normalizedItems = Array.isArray(items) ? items.map((item, index) => {
    try { return normalizeLink(item, index); } catch { return null; }
  }).filter(Boolean) : [];
  const legacyPayload = normalizedMetadata.legacyMenuItems;
  const grouped = legacyPayload?.schema === "iam.cms.footer-menu.v1" && Array.isArray(legacyPayload.groups);
  return {
    id: row.id, site_id: row.site_id, handle: row.handle, title: row.title, status: row.status,
    layout: grouped ? "grouped-footer" : "links",
    items: normalizedItems, groups: grouped ? legacyPayload.groups : [],
    metadata: normalizedMetadata, read_only: Boolean(normalizedMetadata.legacyMenuItemsRaw),
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function assertNavigationSchema(db) {
  const columns = new Set((await all(db, "PRAGMA table_info(cms_navigation_menus)")).map(column => column.name));
  if (REQUIRED_COLUMNS.some(column => !columns.has(column))) return { ok: false, status: 503, error: "cms_navigation_schema_upgrade_required" };
  const revisions = await first(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='cms_revisions'");
  if (!String(revisions?.sql || "").includes("'navigation'")) return { ok: false, status: 503, error: "cms_navigation_revision_schema_upgrade_required" };
  return { ok: true, columns };
}

function buildLegacyValues(site, menu) {
  return {
    project_id: site.slug || site.id,
    project_slug: site.slug || null,
    menu_name: menu.handle,
    menu_type: menu.layout === "grouped-footer" ? "site_footer" : "site",
    menu_items: menu.layout === "grouped-footer" ? JSON.stringify(menu.metadata.legacyMenuItems) : JSON.stringify(menu.items),
    is_active: menu.status === "active" ? 1 : 0,
  };
}

function snapshot(menu) {
  return JSON.stringify({
    id: menu.id, handle: menu.handle, title: menu.title, status: menu.status,
    layout: menu.layout, items: menu.items, groups: menu.groups, metadata: menu.metadata,
  });
}

async function recordRevision(db, site, menu, revisionKind = "history") {
  const serialized = snapshot(menu);
  const latest = await first(db,
    "SELECT revision_number,revision_kind,snapshot_json FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='navigation' AND entity_id=? ORDER BY revision_number DESC LIMIT 1",
    site.account_id, site.id, menu.id);
  if (latest?.snapshot_json === serialized && latest?.revision_kind === revisionKind) return Number(latest.revision_number || 0);
  const revisionNumber = Number(latest?.revision_number || 0) + 1;
  await run(db,
    "INSERT INTO cms_revisions (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json) VALUES (?,?,'navigation',?,?,?,NULL,NULL,?,?)",
    site.account_id, site.id, menu.id, revisionNumber, revisionKind, serialized, JSON.stringify({ source: "cms-navigation-editor" }));
  return revisionNumber;
}

async function readMenu(db, site, menuId) {
  const row = await first(db,
    "SELECT id,account_id,site_id,handle,title,items_json,status,metadata_json,created_at,updated_at FROM cms_navigation_menus WHERE id=? AND account_id=? AND site_id=? LIMIT 1",
    menuId, site.account_id, site.id);
  return row ? toMenu(row) : null;
}

export async function listCmsNavigationMenus(db, site) {
  const schema = await assertNavigationSchema(db);
  if (!schema.ok) return schema;
  const rows = await all(db,
    "SELECT id,account_id,site_id,handle,title,items_json,status,metadata_json,created_at,updated_at FROM cms_navigation_menus WHERE account_id=? AND site_id=? ORDER BY handle,title",
    site.account_id, site.id);
  return { ok: true, site_id: site.id, menus: rows.map(toMenu) };
}

export async function createCmsNavigationMenu(db, site, input = {}) {
  const schema = await assertNavigationSchema(db);
  if (!schema.ok) return schema;
  let menu;
  try { menu = normalizeMenuPayload(input); }
  catch (error) { return { ok: false, status: 400, error: error.message || "invalid_navigation_menu" }; }
  const now = new Date().toISOString();
  const values = {
    account_id: site.account_id, site_id: site.id,
    handle: menu.handle, title: menu.title, items_json: JSON.stringify(menu.items),
    status: menu.status, metadata_json: JSON.stringify(menu.metadata), created_at: now, updated_at: now,
    ...buildLegacyValues(site, menu),
  };
  const columns = Object.keys(values).filter(column => schema.columns.has(column));
  try {
    const insertSql = "INSERT INTO cms_navigation_menus (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") + ")";
    await db.prepare(insertSql).bind(...columns.map(column => values[column])).run();
  } catch (error) {
    const message = String(error?.message || error);
    const conflict = /unique|constraint/i.test(message);
    return { ok: false, status: conflict ? 409 : 503, error: conflict ? "navigation_handle_conflict" : "navigation_create_failed" };
  }
  const created = await first(db, "SELECT id FROM cms_navigation_menus WHERE account_id=? AND site_id=? AND handle=? LIMIT 1", site.account_id, site.id, menu.handle);
  if (!created?.id) return { ok: false, status: 503, error: "navigation_create_verification_failed" };
  menu.id = created.id;
  await recordRevision(db, site, menu, menu.status === "active" ? "published" : "draft");
  return { ok: true, menu: await readMenu(db, site, created.id) };
}

export async function updateCmsNavigationMenu(db, site, menuId, input = {}) {
  const schema = await assertNavigationSchema(db);
  if (!schema.ok) return schema;
  const current = await readMenu(db, site, menuId);
  if (!current) return { ok: false, status: 404, error: "navigation_menu_not_found" };
  const expectedUpdatedAt = String(input.expected_updated_at ?? "");
  if (!expectedUpdatedAt) return { ok: false, status: 428, error: "navigation_expected_updated_at_required" };
  const currentRow = await first(db, "SELECT updated_at FROM cms_navigation_menus WHERE id=? AND account_id=? AND site_id=?", menuId, site.account_id, site.id);
  if (currentRow?.updated_at !== expectedUpdatedAt) return { ok: false, status: 409, error: "navigation_menu_conflict", menu: current };
  if (current.read_only) return { ok: false, status: 409, error: "navigation_menu_legacy_payload_read_only" };

  let menu;
  try { menu = normalizeMenuPayload(input, current); }
  catch (error) { return { ok: false, status: 400, error: error.message || "invalid_navigation_menu" }; }
  menu.id = current.id;
  const now = new Date().toISOString();
  const values = {
    handle: menu.handle, title: menu.title, items_json: JSON.stringify(menu.items),
    status: menu.status, metadata_json: JSON.stringify(menu.metadata), updated_at: now,
    ...buildLegacyValues(site, menu),
  };
  const columns = Object.keys(values).filter(column => schema.columns.has(column));
  try {
    const updateSql = "UPDATE cms_navigation_menus SET " + columns.map(column => column + "=?").join(",") +
      " WHERE id=? AND account_id=? AND site_id=? AND updated_at=?";
    const result = await db.prepare(updateSql).bind(...columns.map(column => values[column]), menuId, site.account_id, site.id, expectedUpdatedAt).run();
    if (!(result?.meta?.changes > 0)) return { ok: false, status: 409, error: "navigation_menu_conflict", menu: await readMenu(db, site, menuId) };
  } catch (error) {
    const message = String(error?.message || error);
    const conflict = /unique|constraint/i.test(message);
    return { ok: false, status: conflict ? 409 : 503, error: conflict ? "navigation_handle_conflict" : "navigation_update_failed" };
  }
  const updated = await readMenu(db, site, menuId);
  if (!updated) return { ok: false, status: 503, error: "navigation_update_verification_failed" };
  // Only write snapshots after the compare-and-swap update succeeds. Preserve
  // the pre-edit state when it is not already in history, then capture the new
  // draft/published/archived state as its own revision.
  await recordRevision(db, site, current, "history");
  await recordRevision(db, site, updated,
    updated.status === "active" ? "published" : updated.status === "archived" ? "history" : "draft");
  return { ok: true, menu: updated };
}

export async function archiveCmsNavigationMenu(db, site, menuId, expectedUpdatedAt) {
  const current = await readMenu(db, site, menuId);
  if (!current) return { ok: false, status: 404, error: "navigation_menu_not_found" };
  if (!expectedUpdatedAt || current.updated_at !== expectedUpdatedAt) return { ok: false, status: 409, error: "navigation_menu_conflict", menu: current };
  return updateCmsNavigationMenu(db, site, menuId, {
    handle: current.handle, title: current.title, items: current.items,
    groups: current.groups, layout: current.layout, status: "archived",
    expected_updated_at: expectedUpdatedAt,
  });
}

export async function listCmsNavigationRevisions(db, site, menuId) {
  const schema = await assertNavigationSchema(db);
  if (!schema.ok) return schema;
  const menu = await readMenu(db, site, menuId);
  if (!menu) return { ok: false, status: 404, error: "navigation_menu_not_found" };
  const revisions = await all(db,
    "SELECT id,revision_number,revision_kind,snapshot_json,metadata_json,created_at FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='navigation' AND entity_id=? ORDER BY revision_number DESC LIMIT 50",
    site.account_id, site.id, menuId);
  return { ok: true, menu_id: menuId, revisions: revisions.map(row => ({
    id: row.id, revision_number: row.revision_number, revision_kind: row.revision_kind,
    snapshot: parseJson(row.snapshot_json, {}), metadata: parseJson(row.metadata_json, {}), created_at: row.created_at,
  })) };
}

export async function loadPrimaryCmsNavigation(db, site) {
  const schema = await assertNavigationSchema(db);
  if (!schema.ok) return null;
  const row = await first(db,
    "SELECT id,account_id,site_id,handle,title,items_json,status,metadata_json,created_at,updated_at FROM cms_navigation_menus WHERE account_id=? AND site_id=? AND status='active' AND handle IN ('main','primary','header') ORDER BY CASE handle WHEN 'main' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END LIMIT 1",
    site.account_id, site.id);
  if (!row) return null;
  const menu = toMenu(row);
  return menu.layout === "links" && !menu.read_only ? menu.items : null;
}

export async function upsertPrimaryCmsNavigation(db, site, items) {
  const existing = await first(db,
    "SELECT id,updated_at FROM cms_navigation_menus WHERE account_id=? AND site_id=? AND handle IN ('main','primary','header') ORDER BY CASE handle WHEN 'main' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END LIMIT 1",
    site.account_id, site.id);
  if (existing) return updateCmsNavigationMenu(db, site, existing.id, {
    handle: "main", title: "Main menu", items, status: "active", expected_updated_at: existing.updated_at,
  });
  return createCmsNavigationMenu(db, site, { handle: "main", title: "Main menu", items, status: "active" });
}

