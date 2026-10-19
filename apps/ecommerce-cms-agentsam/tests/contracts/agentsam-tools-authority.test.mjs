import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appRoot, "../..");

test("agentsam_tools is the tool-to-capability authority and the old join name is compatibility-only", async () => {
  const sql = await readFile(
    path.join(repoRoot, "db/migrate-agentsam-tools-authority-20261007.sql"),
    "utf8",
  );

  assert.match(sql, /ALTER TABLE agentsam_tools ADD COLUMN app_id TEXT/);
  assert.match(sql, /ALTER TABLE agentsam_tools ADD COLUMN resource_scope_json TEXT/);
  assert.match(sql, /ALTER TABLE agentsam_tools ADD COLUMN operations_json TEXT/);
  assert.match(sql, /DROP TABLE IF EXISTS agentsam_tool_capabilities/);
  assert.match(sql, /CREATE VIEW agentsam_tool_capabilities AS/);
  assert.match(sql, /id AS tool_id,\s*capability_key/);
});

test("canonical capability namespace is provider-neutral and domain-first", async () => {
  const sql = await readFile(
    path.join(repoRoot, "db/migrate-agentsam-tools-authority-20261007.sql"),
    "utf8",
  );
  for (const capability of [
    "commerce.catalog.read",
    "commerce.product.publish",
    "media.library.read",
    "database.query",
    "storage.objects.list",
    "retrieval.semantic.search",
    "repository.list",
  ]) {
    assert.match(sql, new RegExp(capability.replaceAll(".", "\\.")));
  }
});

test("Growth and Resend seed real App tools with scoped write gates", async () => {
  const sql = await readFile(
    path.join(repoRoot, "db/seed-agentsam-app-tools-20261007.sql"),
    "utf8",
  );

  assert.match(sql, /'growth_campaigns_list'/);
  assert.match(sql, /'growth_campaign_publish'/);
  assert.match(sql, /'email_mailboxes_list'/);
  assert.match(sql, /'email_messages_list'/);
  assert.match(sql, /'email_send'/);
  assert.match(sql, /owner_user_id\/owner_auth_email\/access_json/);
  assert.match(sql, /'high',1,1,'content'.*'email_send'/s);
  assert.match(sql, /plugin_key.*resend/s);
});

test("repository contract registry records app, surface, Apps and tool authority with hashes", async () => {
  const registry = JSON.parse(
    await readFile(path.join(appRoot, "repository.contracts.json"), "utf8"),
  );
  const generated = await readFile(
    path.join(repoRoot, "db/seed-agentsam-repository-contracts.generated.sql"),
    "utf8",
  );

  const keys = new Set(registry.contracts.map((entry) => entry.contract_key));
  for (const contract of [
    "application.ecommerce-cms-agentsam",
    "surface.admin",
    "app.product-studio",
    "app.growth",
    "app.completeful",
    "app.resend",
    "schema.agentsam-tools",
  ]) {
    assert.ok(keys.has(contract));
    assert.match(generated, new RegExp(contract.replaceAll(".", "\\.")));
  }

  assert.match(generated, /'[0-9a-f]{64}'/);
  const legacy = registry.contracts.find(
    (entry) => entry.contract_key === "package.completeful",
  );
  assert.equal(legacy?.status, "deprecated");
  assert.equal(legacy?.metadata?.canonical_contract, "app.completeful");
});
