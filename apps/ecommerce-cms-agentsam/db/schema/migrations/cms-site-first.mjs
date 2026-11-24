import { readFileSync } from "node:fs";
import { migrateCmsNavigationRuntime } from "./cms-navigation-runtime.mjs";

const migration = readFileSync(new URL("../../migrations/004_cms_site_first.sql", import.meta.url), "utf8");
const REQUIRED_TABLES = [
  "cms_sites", "cms_pages", "cms_page_sections", "cms_section_blocks",
  "cms_globals", "cms_revisions", "cms_navigation_menus", "cms_publications",
  "cms_collections", "cms_collection_items",
];
const REQUIRED_NAVIGATION_COLUMNS = [
  "account_id", "site_id", "handle", "title", "items_json", "status", "metadata_json",
];
const REQUIRED_REVISION_COLUMNS = [
  "id", "account_id", "site_id", "entity_type", "entity_id", "revision_number",
  "revision_kind", "content_object_key", "content_hash", "snapshot_json", "metadata_json", "created_at",
];

async function verifySiteFirstSchema(sql, errorCode) {
  const tableRows = await sql.all(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED_TABLES.map(() => "?").join(",")})`,
    REQUIRED_TABLES,
  );
  const present = new Set(tableRows.map(row => row.name));
  const artifactColumns = new Set((await sql.all("PRAGMA table_info(cms_artifacts)")).map(row => row.name));
  const globalsColumns = new Set((await sql.all("PRAGMA table_info(cms_globals)")).map(row => row.name));
  const revisionColumns = new Set((await sql.all("PRAGMA table_info(cms_revisions)")).map(row => row.name));
  const navigationColumns = new Set((await sql.all("PRAGMA table_info(cms_navigation_menus)")).map(row => row.name));
  const revisionDefinition = await sql.first("SELECT sql FROM sqlite_master WHERE type='table' AND name='cms_revisions'");
  const pageColumns = new Set((await sql.all("PRAGMA table_info(cms_pages)")).map(row => row.name));
  const missing = REQUIRED_TABLES.some(table => !present.has(table)) ||
    !pageColumns.has("site_id") ||
    !artifactColumns.has("object_prefix") || !artifactColumns.has("manifest_object_key") ||
    !globalsColumns.has("site_id") ||
    REQUIRED_REVISION_COLUMNS.some(column => !revisionColumns.has(column)) ||
    REQUIRED_NAVIGATION_COLUMNS.some(column => !navigationColumns.has(column)) ||
    !String(revisionDefinition?.sql || "").includes("'navigation'");
  if (missing) throw new Error(errorCode);
  const unscoped = await sql.first("SELECT COUNT(*) AS count FROM cms_navigation_menus WHERE account_id IS NULL OR site_id IS NULL OR handle IS NULL");
  if (Number(unscoped?.count || 0) > 0) throw new Error(errorCode);
  const integrity = await sql.all("PRAGMA foreign_key_check");
  if (integrity.length) throw new Error(errorCode.replace("verification", "foreign_key_check"));
}

/**
 * Apply the canonical site-first CMS migration to a SQLite/D1-compatible store.
 * This is an explicit migration entrypoint; it is never run implicitly on a
 * production request. The navigation-runtime migration is chained here because
 * production already has site_id on cms_pages but still has the older menu and
 * revision schemas. There is deliberately one registered migration runner.
 */
export async function migrateCmsSiteFirst(sql) {
  const pageColumns = await sql.all("PRAGMA table_info(cms_pages)");
  if (!pageColumns.length) throw new Error("cms_site_first_requires_canonical_schema");
  const names = new Set(pageColumns.map(row => row.name));
  const sites = await sql.all("SELECT name FROM sqlite_master WHERE type='table' AND name='cms_sites'");

  if (names.has("site_id")) {
    if (!sites.length) throw new Error("cms_site_first_partial_migration_detected");
    const tables = await sql.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED_TABLES.map(() => "?").join(",")})`,
      REQUIRED_TABLES,
    );
    const present = new Set(tables.map(row => row.name));
    if (REQUIRED_TABLES.some(table => !present.has(table))) throw new Error("cms_site_first_partial_migration_detected");

    const navigation = await migrateCmsNavigationRuntime(sql);
    await verifySiteFirstSchema(sql, "cms_site_first_partial_migration_detected");
    if (navigation.migrated) {
      return { migrated: true, migration: "cms-navigation-runtime", navigation, tables: REQUIRED_TABLES };
    }
    return { skipped: true, reason: "site_first_schema_complete" };
  }
  if (sites.length) throw new Error("cms_site_first_partial_migration_detected");

  await sql.exec(migration);
  const navigation = await migrateCmsNavigationRuntime(sql);
  await verifySiteFirstSchema(sql, "cms_site_first_verification_failed");
  return { migrated: true, tables: REQUIRED_TABLES, navigation };
}
