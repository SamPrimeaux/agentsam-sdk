import { readFileSync } from "node:fs";

export const stub = "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY);\n";

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

export const schema = [preSiteSchema, siteFirstMigration].join("\n\n");
