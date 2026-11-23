import { readFileSync } from "node:fs";

export const stub = "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active');\n";

// Tests consume the same ordered schema/migration chain as the product.
// Do not maintain a second embedded CMS schema in the test harness.
export const preSiteSchema = [
  readFileSync(new URL("../db/schema/cms.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../db/migrations/002_cms_definitions.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../db/migrations/003_definitions_seed_notes.sql", import.meta.url), "utf8"),
].join("\n\n");

export const siteFirstMigration = readFileSync(
  new URL("../db/migrations/004_cms_site_first.sql", import.meta.url), "utf8",
);

export const siteThemesMigration = readFileSync(
  new URL("../db/migrations/005_cms_site_themes.sql", import.meta.url), "utf8",
);

// Activity logging is present in production D1, and test D1 must implement
// the exact same append-only schema instead of silently dropping audit rows.
export const activityLogMigration = readFileSync(
  new URL("../db/migrations/010_cms_activity_log.sql", import.meta.url), "utf8",
);

export const schema = [preSiteSchema, siteFirstMigration, siteThemesMigration, activityLogMigration].join("\n\n");
