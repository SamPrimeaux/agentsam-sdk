import test from "node:test";
import assert from "node:assert/strict";
import { __setApplicationAccountId } from "../backend/lib/account-context.js";
import { listCatalogModels } from "../backend/agentsam/model-catalog-tools.js";
import { executeCoreTool } from "../backend/agentsam/core-tools.js";
import { listAgentSamTools, getAgentSamTool } from "../backend/agentsam/tools-registry.js";
import { isAgentSamToolExecutable } from "../backend/agentsam/tool-handlers.js";

const ACCOUNT = "acct_authorized";
const ROOT_REPO = "org/installation";
const row = (tool_key, extra = {}) => ({
  tool_key, tool_name: tool_key, display_name: tool_key, tool_category: "test",
  capability_key: "agentsam.models.read", handler_type: "d1",
  handler_config: "{}", resource_scope_json: "{}", input_schema: '{"type":"object"}',
  is_active: 1, is_degraded: 0, account_id: ACCOUNT, ...extra,
});
const fakeCatalogModel = {
  model_key: "openai:test", api_model_id: "test", provider: "openai",
  display_name: "Test", model_kind: "text_generation", tier: "fast",
  lifecycle_status: "active", is_active: 1, show_in_picker: 1,
  supports_tools: 1, supports_vision: 0, supports_streaming: 1,
  supports_json_mode: 0, supports_reasoning: 0,
  policy_active: 1, routing_eligible: 1, current_price_rows: 1,
  verified_price_rows: 0, requires_budget_gate: 1,
};

function dbFixture({ tools = [], catalog = [], pricing = [], lanes = [] } = {}) {
  const statements = [];
  const db = {
    statements,
    prepare(sql) {
      const statement = {
        bind(...args) {
          const query = { sql, args }; statements.push(query);
          return {
            async all() {
              if (sql.includes("FROM agentsam_tools")) return { results: tools };
              if (sql.includes("FROM agentsam_model_catalog c")) return { results: catalog };
              if (sql.includes("FROM agentsam_model_pricing") && !sql.includes("COUNT(*)")) return { results: pricing };
              if (sql.includes("FROM agentsam_pgvector_lane_registry")) return { results: lanes };
              return { results: [] };
            },
            async first() {
              if (sql.includes("FROM accounts")) return { id: ACCOUNT };
              if (sql.includes("FROM agentsam_plugins")) {
                return { config_json: JSON.stringify({ github_repo: ROOT_REPO }), metadata_json: "{}" };
              }
              return tools.find(tool => tool.tool_key === args[1]) || null;
            },
          };
        },
      };
      return statement;
    },
  };
  return db;
}

test("model reader uses the canonical catalog/policy and never falls back to agentsam_ai", async () => {
  const db = dbFixture({ catalog: [fakeCatalogModel] });
  const out = await listCatalogModels({ DB: db }, { provider: "openai", routing_eligible_only: true });
  assert.equal(out.ok, true);
  assert.equal(out.source, "agentsam_model_catalog");
  assert.equal(out.models.length, 1);
  assert.equal(out.models[0].routing_eligible, true);
  assert.equal(out.models[0].pricing_verified, false);
  assert.equal(out.models[0].requires_budget_gate, true);
  assert.ok(db.statements[0].sql.includes("LEFT JOIN agentsam_model_policies"));
  assert.ok(db.statements[0].sql.includes("c.is_active = 1"));
  assert.deepEqual(db.statements[0].args, ["openai", 50]);
  assert.ok(!db.statements.some(q => /\bagentsam_ai\b/.test(q.sql)));
});

test("catalog does not invent available models when all rows are inactive", async () => {
  const out = await listCatalogModels({ DB: dbFixture() });
  assert.equal(out.ok, true);
  assert.equal(out.models.length, 0);
  assert.match(out.note, /legacy agentsam_ai was not substituted/);
});

test("pricing and retrieval lane inspection requires explicit options and caller scope", async () => {
  __setApplicationAccountId(ACCOUNT);
  const db = dbFixture({
    catalog: [fakeCatalogModel],
    pricing: [{ model_key: "openai:test", meter: "input_tokens", rate_usd: 1.2, verified_at: null }],
    lanes: [{ id: "l1", embedding_model: "bge-m3", binding_name: "VECTORS", tracked_chunks: 4 }],
  });
  const out = await listCatalogModels({ DB: db, VECTORS: { query() {} } }, {
    include_pricing: true, include_retrieval_lanes: true,
  });
  assert.equal(out.pricing.length, 1);
  assert.equal(out.pricing[0].verified, false);
  assert.equal(out.retrieval_lanes[0].runtime_binding_available, true);
  const laneQuery = db.statements.find(q => q.sql.includes("FROM agentsam_pgvector_lane_registry"));
  assert.deepEqual(laneQuery.args, [ACCOUNT, ACCOUNT]);
  assert.match(out.retrieval_note, /not chat-model catalog entries/);
  __setApplicationAccountId(null);
});

test("invalid model tool inputs fail explicitly instead of being silently ignored", async () => {
  const env = { DB: dbFixture() };
  assert.equal((await listCatalogModels(env, { limit: 500 })).error, "invalid_limit");
  assert.equal((await listCatalogModels(env, { unknown_filter: 1 })).error, "unknown_input_field");
  assert.equal((await listCatalogModels(env, { picker_only: "yes" })).error, "invalid_boolean");
});

test("bad GitHub allowlist or mismatched account denies only that tool", async () => {
  __setApplicationAccountId(ACCOUNT);
  const ping = row("agentsam_ping");
  const repo = row("agentsam_github_repo_list", {
    handler_type: "mcp",
    handler_config: JSON.stringify({ repo_allowlist: [ROOT_REPO] }),
  });
  const crossed = row("completeful_catalog_list", {
    resource_scope_json: JSON.stringify({ account_id: "another_account" }),
  });
  const malformed = row("untrusted_repo", {
    handler_config: JSON.stringify({ repo_allowlist: "invalid" }),
  });
  const db = dbFixture({ tools: [ping, repo, crossed, malformed] });
  const env = { DB: db };
  const visible = await listAgentSamTools(env);
  assert.deepEqual(visible.map(x => x.tool_key), ["agentsam_ping", "agentsam_github_repo_list"]);
  assert.equal(await getAgentSamTool(env, "completeful_catalog_list"), null);
  assert.equal(await getAgentSamTool(env, "untrusted_repo"), null);
  __setApplicationAccountId(null);
});

test("runtime bindings are verified without any hardcoded FNF platform-scope names", async () => {
  __setApplicationAccountId(ACCOUNT);
  const vector = row("search_vector", {
    handler_type: "vectorize",
    handler_config: '{"binding":"VECTOR_BINDING"}',
  });
  const image = row("image_transform", {
    handler_type: "cf",
    handler_config: '{"binding":"ASSETS"}',
  });
  const db = dbFixture({ tools: [vector, image] });
  const visible = await listAgentSamTools({
    DB: db,
    VECTOR_BINDING: { query() {} },
    ASSETS: { list() {} },
  });
  assert.equal(visible.length, 2);
  assert.equal(isAgentSamToolExecutable(visible[0]), true);
  assert.deepEqual((await listAgentSamTools({ DB: db })).map(x => x.tool_key), []);
  __setApplicationAccountId(null);
});

test("legacy model tool key executes only the new canonical reader", async () => {
  const db = dbFixture({ catalog: [fakeCatalogModel] });
  const out = await executeCoreTool({ DB: db }, { tool_key: "fnf_agentsam_ai_models" }, {
    include_inactive: true, provider: "openai",
  });
  assert.equal(out.ok, true);
  assert.equal(out.source, "agentsam_model_catalog");
  assert.deepEqual(out.models.map(model => model.model_key), ["openai:test"]);
  assert.ok(!db.statements.some(q => /\\bagentsam_ai\\b/.test(q.sql)));
});
