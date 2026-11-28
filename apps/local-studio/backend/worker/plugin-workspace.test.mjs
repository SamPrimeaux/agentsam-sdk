import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPluginWorkspaceArgs,
  mergeBrandWorkspaceResult,
  selectPluginWorkspaceContextTool,
} from "./plugin-workspace.js";

const plugin = {
  plugin_key: "agentsam-brand",
  endpoint_url: "https://plugins.inneranimalmedia.com/mcp/brand",
};

function tool(tool_key, inputSchema = {}, overrides = {}) {
  return {
    tool_key,
    input_schema: JSON.stringify(inputSchema),
    handler_config: JSON.stringify({ remote_tool: tool_key, server_url: plugin.endpoint_url }),
    ...overrides,
  };
}

test("Brand workspace prefers the purpose-built tool when it is registered", () => {
  const legacy = tool("brand.get_context");
  const preferred = tool("brand.workspace.build", {
    type: "object",
    properties: { brandSlug: { type: "string" } },
  });
  assert.equal(selectPluginWorkspaceContextTool(plugin, [legacy, preferred]), preferred);
});

test("Brand workspace falls back to the live brand.get_context registration", () => {
  const legacy = tool("brand.get_context");
  assert.equal(selectPluginWorkspaceContextTool(plugin, [legacy]), legacy);
});

test("workspace context selection rejects tools bound to a different endpoint or remote name", () => {
  const wrongEndpoint = tool(
    "brand.get_context",
    {},
    {
      handler_config: JSON.stringify({
        remote_tool: "brand.get_context",
        server_url: "https://other.example/mcp",
      }),
    },
  );
  const wrongName = tool(
    "brand.workspace.build",
    {},
    {
      handler_config: JSON.stringify({
        remote_tool: "brand.workspace.build.v2",
        server_url: plugin.endpoint_url,
      }),
    },
  );
  assert.equal(selectPluginWorkspaceContextTool(plugin, [wrongEndpoint, wrongName]), null);
});

test("legacy get_context receives no undeclared brand selector", () => {
  const legacy = tool("brand.get_context", { type: "object", properties: {} });
  assert.deepEqual(buildPluginWorkspaceArgs(legacy, { brandSlug: "primetech" }), {});
});

test("workspace selector supports declared camelCase and snake_case inputs", () => {
  const camel = tool("brand.workspace.build", { properties: { brandSlug: { type: "string" } } });
  const snake = tool("brand.workspace.build", { properties: { brand_slug: { type: "string" } } });
  assert.deepEqual(buildPluginWorkspaceArgs(camel, { brandSlug: "primetech" }), {
    brandSlug: "primetech",
  });
  assert.deepEqual(buildPluginWorkspaceArgs(snake, { brandSlug: "primetech" }), {
    brand_slug: "primetech",
  });
});

test("non-Brand plugin workspace continues to use its registered get_context tool", () => {
  const campaign = {
    plugin_key: "agentsam-campaign",
    endpoint_url: "https://plugins.example/mcp/campaign",
  };
  const context = {
    tool_key: "campaign.get_context",
    handler_config: JSON.stringify({
      remote_tool: "campaign.get_context",
      server_url: campaign.endpoint_url,
    }),
  };
  assert.equal(selectPluginWorkspaceContextTool(campaign, [context]), context);
});

test("Brand workspace always uses canonical registry identities and account-owned assets", async () => {
  const registryBrand = {
    id: "brand_primetech",
    slug: "primetech",
    name: "PrimeTech",
    display_name: "PrimeTech",
    status: "active",
    assetCount: 26,
    assets: { items: [{ id: "asset_1", asset_key: "icon-prime-spectrum-bare-p" }], total: 26 },
  };
  const remote = {
    data: {
      activeBrandSlug: "primetech",
      brands: [
        {
          id: "brand_primetech",
          slug: "primetech",
          name: "Old remote label",
          contract: {
            id: "contract_1",
            status: "approved",
            visual_system: { colors: { resolved: { primary: "#123456" } } },
          },
          contractRevisions: [{ id: "revision_1", status: "approved" }],
        },
        { id: "remote_only_brand", slug: "not-in-registry", name: "Must not become an identity" },
      ],
    },
  };
  const merged = mergeBrandWorkspaceResult(remote, [registryBrand], []);
  assert.equal(merged.data.brands.length, 1);
  assert.equal(merged.data.brands[0].name, "PrimeTech");
  assert.equal(merged.data.brands[0].assetCount, 26);
  assert.equal(merged.data.brands[0].assets.total, 26);
  assert.equal(merged.data.brands[0].contract.status, "approved");
  assert.equal(merged.data.brands[0].contractRevisions[0].id, "revision_1");
  assert.equal(merged.data.activeBrandSlug, "primetech");
  assert.equal(merged.data.registrySource, "brands");
});

test("Brand workspace still renders canonical registry rows when the remote context tool returns text or fails", () => {
  const registryBrand = {
    id: "brand_primetech",
    slug: "primetech",
    name: "PrimeTech",
    assets: { items: [], total: 26 },
    assetCount: 26,
  };
  const fromText = mergeBrandWorkspaceResult(
    [{ type: "text", text: JSON.stringify({ activeBrandSlug: "primetech", brands: [] }) }],
    [registryBrand],
    [{ brandSlug: "legacy", assetCount: 2, status: "active" }],
  );
  assert.equal(fromText.data.brands[0].slug, "primetech");
  assert.equal(fromText.data.unmatchedAssetSlugs[0].brandSlug, "legacy");
  const withoutRemote = mergeBrandWorkspaceResult(
    null,
    [registryBrand],
    [],
    "BrandContract context unavailable",
  );
  assert.equal(withoutRemote.data.brands[0].assetCount, 26);
  assert.match(withoutRemote.data.warnings[0], /unavailable/);
});
