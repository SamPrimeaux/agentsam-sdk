import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../migrations/004_cms_site_first.sql", import.meta.url), "utf8");

/**
 * Apply the canonical site-first CMS migration to a SQLite/D1-compatible store.
 * This is an explicit migration entrypoint; it is never run implicitly on a
 * production request. Callers must take a backup and verify their provider
 * adapter before applying it to customer data.
 */
export async function migrateCmsSiteFirst(sql) {
  const pageColumns = await sql.all("PRAGMA table_info(cms_pages)");
  if (!pageColumns.length) throw new Error("cms_site_first_requires_canonical_schema");
  const names = new Set(pageColumns.map(row => row.name));
  const sites = await sql.all("SELECT name FROM sqlite_master WHERE type='table' AND name='cms_sites'");
  if (names.has("site_id")) {
    if (!sites.length) throw new Error("cms_site_first_partial_migration_detected");
    const requiredTables = [
      "cms_sites", "cms_pages", "cms_page_sections", "cms_section_blocks",
      "cms_globals", "cms_revisions", "cms_navigation_menus", "cms_publications",
      "cms_collections", "cms_collection_items",
    ];
    const tableRows = await sql.all(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => "?").join(",")})`, requiredTables);
    const present = new Set(tableRows.map(row => row.name));
    const artifactColumns = new Set((await sql.all("PRAGMA table_info(cms_artifacts)")).map(row => row.name));
    const globalsColumns = new Set((await sql.all("PRAGMA table_info(cms_globals)")).map(row => row.name));
    const revisionColumns = new Set((await sql.all("PRAGMA table_info(cms_revisions)")).map(row => row.name));
    if (requiredTables.some(table => !present.has(table)) ||
        !artifactColumns.has("object_prefix") || !artifactColumns.has("manifest_object_key") ||
        !globalsColumns.has("site_id") || !revisionColumns.has("site_id")) {
      throw new Error("cms_site_first_partial_migration_detected");
    }
    return { skipped: true, reason: "site_id_already_present" };
  }
  if (sites.length) throw new Error("cms_site_first_partial_migration_detected");

  await sql.exec(migration);

  const migratedColumns = await sql.all("PRAGMA table_info(cms_pages)");
  const migratedNames = new Set(migratedColumns.map(row => row.name));
  if (!migratedNames.has("site_id")) throw new Error("cms_site_first_verification_failed");
  const requiredTables = [
    "cms_sites", "cms_pages", "cms_page_sections", "cms_section_blocks",
    "cms_globals", "cms_revisions", "cms_navigation_menus", "cms_publications",
    "cms_collections", "cms_collection_items",
  ];
  const tableRows = await sql.all(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => "?").join(",")})`, requiredTables);
  const present = new Set(tableRows.map(row => row.name));
  if (requiredTables.some(table => !present.has(table))) throw new Error("cms_site_first_verification_failed");
  const integrity = await sql.all("PRAGMA foreign_key_check");
  if (integrity.length) throw new Error("cms_site_first_foreign_key_check_failed");
  return { migrated: true, tables: [
    "cms_sites", "cms_pages", "cms_page_sections", "cms_section_blocks",
    "cms_globals", "cms_revisions", "cms_navigation_menus", "cms_publications",
    "cms_collections", "cms_collection_items",
  ] };
}
