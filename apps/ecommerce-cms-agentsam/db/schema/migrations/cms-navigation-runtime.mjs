const NAVIGATION_COLUMNS = [
  ["account_id", "TEXT"],
  ["handle", "TEXT"],
  ["title", "TEXT"],
  ["items_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["status", "TEXT NOT NULL DEFAULT 'draft'"],
  ["metadata_json", "TEXT NOT NULL DEFAULT '{}'"],
];

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return null; }
}

function slugify(value, fallback) {
  const result = String(value || "").trim().toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
  return result || fallback;
}

async function extendRevisionKinds(sql) {
  const row = await sql.first("SELECT sql FROM sqlite_master WHERE type='table' AND name='cms_revisions'");
  if (!row?.sql) throw new Error("cms_navigation_runtime_revisions_missing");
  const columns = new Set((await sql.all("PRAGMA table_info(cms_revisions)")).map(column => column.name));
  const required = ["id", "account_id", "site_id", "entity_type", "entity_id", "revision_number", "revision_kind", "content_object_key", "content_hash", "snapshot_json", "metadata_json", "created_at"];
  if (required.some(column => !columns.has(column))) throw new Error("cms_navigation_runtime_revisions_schema_unsupported");
  if (row.sql.includes("'navigation'")) return false;
  const references = await sql.all("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%REFERENCES cms_revisions%'");
  if (references.length) throw new Error("cms_navigation_runtime_revisions_referenced");

  await sql.exec(`
    DROP TABLE IF EXISTS cms_revisions__navigation_next;
    CREATE TABLE cms_revisions__navigation_next (
      id TEXT PRIMARY KEY DEFAULT ('cmsr_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      site_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('page','section','block','global','navigation')),
      entity_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL DEFAULT 0,
      revision_kind TEXT NOT NULL DEFAULT 'current'
        CHECK(revision_kind IN ('current','history','published','draft','imported')),
      content_object_key TEXT,
      content_hash TEXT,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key),
      FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
    );
    INSERT INTO cms_revisions__navigation_next (
      id,account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
      content_object_key,content_hash,snapshot_json,metadata_json,created_at
    ) SELECT
      id,account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
      content_object_key,content_hash,snapshot_json,metadata_json,created_at
    FROM cms_revisions;
    DROP TABLE cms_revisions;
    ALTER TABLE cms_revisions__navigation_next RENAME TO cms_revisions;
    CREATE INDEX IF NOT EXISTS idx_cms_revisions_entity
      ON cms_revisions(site_id,entity_type,entity_id,revision_number DESC);
  `);
  return true;
}

/**
 * Upgrade the partially site-first production navigation table without dropping
 * its legacy columns. The old storefront and newer CMS editor can therefore
 * coexist during rollout while both write the same menu records.
 */
export async function migrateCmsNavigationRuntime(sql) {
  const before = await sql.all("PRAGMA table_info(cms_navigation_menus)");
  if (!before.length) throw new Error("cms_navigation_runtime_table_missing");
  const beforeNames = new Set(before.map(column => column.name));
  if (!beforeNames.has("site_id")) throw new Error("cms_navigation_runtime_requires_site_scope");
  const legacyItemsPresent = beforeNames.has("menu_items");
  const legacyNamePresent = beforeNames.has("menu_name");
  const legacyTypePresent = beforeNames.has("menu_type");
  const legacyActivePresent = beforeNames.has("is_active");
  const canonicalStatusPresent = beforeNames.has("status");

  const added = [];
  for (const [name, definition] of NAVIGATION_COLUMNS) {
    if (beforeNames.has(name)) continue;
    await sql.exec(`ALTER TABLE cms_navigation_menus ADD COLUMN ${name} ${definition}`);
    added.push(name);
  }

  const rows = await sql.all("SELECT * FROM cms_navigation_menus ORDER BY created_at,id");
  for (const row of rows) {
    const site = row.account_id
      ? { account_id: row.account_id }
      : await sql.first("SELECT account_id FROM cms_sites WHERE id = ? LIMIT 1", [row.site_id]);
    if (!site?.account_id) throw new Error("cms_navigation_runtime_site_account_missing");

    const title = String(row.title || (legacyNamePresent ? row.menu_name : "") || row.handle || "Navigation menu").trim().slice(0, 120);
    const handle = String(row.handle || slugify(legacyNamePresent ? row.menu_name : title, `menu-${String(row.id).slice(0, 8)}`)).slice(0, 64);
    const canonicalItems = beforeNames.has("items_json") ? parseJson(row.items_json) : null;
    const legacyItems = legacyItemsPresent ? parseJson(row.menu_items) : null;
    const parsedItems = Array.isArray(canonicalItems)
      ? canonicalItems
      : Array.isArray(legacyItems) ? legacyItems : [];
    const status = canonicalStatusPresent && ["active", "draft", "archived"].includes(row.status)
      ? row.status
      : legacyActivePresent && Number(row.is_active) === 0 ? "draft" : "active";
    const metadata = parseJson(row.metadata_json);
    const nextMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
    if (legacyTypePresent && row.menu_type != null && nextMetadata.legacyMenuType == null) nextMetadata.legacyMenuType = row.menu_type;
    if (legacyItemsPresent && !Array.isArray(legacyItems) && legacyItems != null && nextMetadata.legacyMenuItems == null) {
      nextMetadata.legacyMenuItems = legacyItems;
    }
    if (legacyItemsPresent && legacyItems == null && row.menu_items != null && nextMetadata.legacyMenuItemsRaw == null) {
      nextMetadata.legacyMenuItemsRaw = String(row.menu_items).slice(0, 12000);
    }

    await sql.run(`
      UPDATE cms_navigation_menus
      SET account_id = ?, handle = ?, title = ?, items_json = ?, status = ?, metadata_json = ?
      WHERE id = ? AND site_id = ?
    `, [site.account_id, handle, title, JSON.stringify(parsedItems), status, JSON.stringify(nextMetadata), row.id, row.site_id]);
  }

  // Resolve any legacy duplicate names deterministically before enforcing the
  // site-scoped handle identity used by the editor and storefront renderer.
  const duplicates = await sql.all(`
    SELECT site_id, handle FROM cms_navigation_menus
    GROUP BY site_id, handle HAVING COUNT(*) > 1
  `);
  for (const duplicate of duplicates) {
    const collisions = await sql.all(`
      SELECT id, handle FROM cms_navigation_menus
      WHERE site_id = ? AND handle = ? ORDER BY created_at,id
    `, [duplicate.site_id, duplicate.handle]);
    for (const row of collisions.slice(1)) {
      const uniqueHandle = `${String(row.handle).slice(0, 52)}-${String(row.id).slice(0, 8)}`;
      await sql.run("UPDATE cms_navigation_menus SET handle = ? WHERE id = ? AND site_id = ?", [uniqueHandle, row.id, duplicate.site_id]);
    }
  }
  await sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_navigation_menus_site_handle ON cms_navigation_menus(site_id,handle)");
  await sql.exec("CREATE INDEX IF NOT EXISTS idx_cms_navigation_menus_account_site ON cms_navigation_menus(account_id,site_id,status)");

  const revisionsExtended = await extendRevisionKinds(sql);
  // Preserve the exact pre-editor state of every existing menu. This makes the
  // first subsequent edit reversible, including imported grouped-footer data.
  const seeded = await sql.run(`
    INSERT INTO cms_revisions (
      account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
      content_object_key,content_hash,snapshot_json,metadata_json
    )
    SELECT
      m.account_id,m.site_id,'navigation',m.id,1,
      CASE WHEN m.status='active' THEN 'published' WHEN m.status='archived' THEN 'history' ELSE 'draft' END,
      NULL,NULL,
      json_object(
        'id',m.id,'handle',m.handle,'title',m.title,'status',m.status,
        'layout',CASE WHEN json_extract(m.metadata_json,'$.legacyMenuItems.schema')='iam.cms.footer-menu.v1' THEN 'grouped-footer' ELSE 'links' END,
        'items',json(m.items_json),
        'groups',json(COALESCE(json_extract(m.metadata_json,'$.legacyMenuItems.groups'),'[]')),
        'metadata',json(m.metadata_json)
      ),
      json_object('source','cms-navigation-migration')
    FROM cms_navigation_menus m
    WHERE NOT EXISTS (
      SELECT 1 FROM cms_revisions r
      WHERE r.account_id=m.account_id AND r.site_id=m.site_id
        AND r.entity_type='navigation' AND r.entity_id=m.id
    )
  `);
  const revisionsSeeded = Number(seeded?.meta?.changes ?? seeded?.changes ?? 0);
  const integrity = await sql.all("PRAGMA foreign_key_check");
  if (integrity.length) throw new Error("cms_navigation_runtime_foreign_key_check_failed");
  return {
    migrated: added.length > 0 || revisionsExtended || revisionsSeeded > 0,
    columnsAdded: added,
    menusBackfilled: rows.length,
    revisionsExtended,
    revisionsSeeded,
  };
}
