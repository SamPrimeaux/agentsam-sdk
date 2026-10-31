import { DatabaseSync } from "node:sqlite";
import { schema, stub } from "./cms-schema.mjs";

export function createCmsTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(stub + "\n" + schema);
  return db;
}

export function seedCmsAccountAndSite(db, {
  accountId = "acct-test",
  siteId = "site-test",
  siteSlug = "default",
  siteName = "Test site",
  isDefault = 1,
} = {}) {
  db.prepare("INSERT OR IGNORE INTO accounts (id) VALUES (?)").run(accountId);
  db.prepare(`INSERT INTO cms_sites (id, account_id, name, slug, status, is_default)
    VALUES (?, ?, ?, ?, 'active', ?)`)
    .run(siteId, accountId, siteName, siteSlug, isDefault);
  return { accountId, siteId };
}
