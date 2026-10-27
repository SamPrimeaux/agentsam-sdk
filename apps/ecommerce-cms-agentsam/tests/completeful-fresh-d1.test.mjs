import test from "node:test";
import assert from "node:assert/strict";
import { handleCompletefulAdminApi } from "../backend/admin/completeful.js";

// A fresh AgentSam installation has the catalog tables, zero supplier rows,
// no sync-state seed, and no optional agentsam_webhooks subscription table.
// Keep this fixture free of F&FT DB access and of any provider credential.
function freshAgentSamEnv() {
  let writeCount = 0;
  const env = { DB: {
    prepare(sql) {
      const query = String(sql);
      const prepared = {
        async first() {
          if (query.includes("FROM agentsam_webhooks")) {
            throw new Error("D1_ERROR: no such table: agentsam_webhooks: SQLITE_ERROR");
          }
          if (query.includes("FROM completeful_catalog_sync_state")) return null;
          if (query.includes("COUNT(*)") && query.includes("completeful_catalog_products")) {
            return Object.fromEntries([
              "shops", "catalog_products", "catalog_variants", "print_locations",
              "catalog_images", "catalog_mockups", "product_links", "variant_links",
              "order_links", "operations", "webhook_events",
            ].map((key) => [key, 0]));
          }
          if (query.includes("COUNT(*)")) return { n: 0 };
          return null;
        },
        async all() { return { results: [] }; },
        async run() { writeCount++; return { meta: { changes: 1 } }; },
        bind() { return this; },
      };
      return prepared;
    },
  } };
  return { env, getWriteCount: () => writeCount };
}

test("fresh AgentSam catalog returns JSON with zero products, not HTTP 500", async () => {
  const { env } = freshAgentSamEnv();
  const url = new URL("https://agentsam.example/api/admin/completeful/catalog?category=apparel&limit=24");
  const res = await handleCompletefulAdminApi(new Request(url), env, url);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.items, []);
  assert.equal(data.pagination.total, 0);
});

test("status works without optional webhook subscription table", async () => {
  const { env } = freshAgentSamEnv();
  const url = new URL("https://agentsam.example/api/admin/completeful/status");
  const res = await handleCompletefulAdminApi(new Request(url), env, url);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.configured, false);
  assert.equal(data.counts.catalog_products, 0);
  assert.equal(data.counts.webhook_subscriptions, 0);
  assert.equal(data.setup_href, "/settings/keys?add=completeful");
});

test("without a Completeful key, sync explains setup and does not mutate D1", async () => {
  const { env, getWriteCount } = freshAgentSamEnv();
  const url = new URL("https://agentsam.example/api/admin/completeful/catalog/sync");
  const res = await handleCompletefulAdminApi(
    new Request(url, { method: "POST", body: "{}" }), env, url);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "completeful_not_configured");
  assert.equal(getWriteCount(), 0);
});
