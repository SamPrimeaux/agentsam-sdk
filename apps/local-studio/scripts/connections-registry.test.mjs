import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BYOK_PROVIDER_DEFINITIONS,
  loadConnectionsRegistry, applyOauthPluginState,
  safePluginSettingsRecord,
} from "../backend/worker/connections-registry.js";

function database({ cloudflare = null, secrets = [] } = {}) {
  return {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          if (sql.includes("user_oauth_tokens") && String(sql).toLowerCase().includes("cloudflare")) {
            return cloudflare;
          }
          return null;
        },
        async all() {
          if (sql.includes("user_secrets")) return { results: secrets };
          if (sql.includes("user_oauth_tokens") && String(sql).toLowerCase().includes("cloudflare")) {
            return { results: cloudflare ? [cloudflare] : [] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
}

describe("connections registry", () => {
  it("returns one OAuth connector and every supported BYOK provider without secret values", async () => {
    const result = await loadConnectionsRegistry(
      {
        DB: database({
          cloudflare: {
            id: "uot_1",
            user_id: "user_1",
            account_identifier: "account_1",
            scopes: "d1.read workers-scripts.write",
            is_active: 1,
            revoked_at: null,
            created_at: 1,
            updated_at: 2,
            expires_at: 3,
            metadata_json: JSON.stringify({ cloudflare_account_id: "account_1", status: "connected" }),
          },
          secrets: [
            {
              id: "usec_1",
              secret_name: "default",
              service_name: "openai",
              description: "OpenAI API key",
              metadata_json: JSON.stringify({ last4: "1234" }),
              last_used_at: null,
              usage_count: 0,
              created_at: 1,
              updated_at: 2,
            },
          ],
        }),
        CLOUDFLARE_OAUTH_CLIENT_ID: "real-client-id",
      },
      "user_1",
    );

    assert.equal(result.connections.length, 1 + BYOK_PROVIDER_DEFINITIONS.length);
    assert.equal(result.connections[0].status, "connected");
    const openai = result.connections.find(
      (row) => row.kind === "byok" && row.provider === "openai",
    );
    assert.equal(openai.status, "configured");
    assert.equal(openai.last4, "1234");
    assert.equal(JSON.stringify(result).includes("secret_value"), false);
  });


  it("projects plugin registry rows to a secret-safe Settings record", () => {
    const safe = safePluginSettingsRecord(
      {
        id: "plg_demo",
        plugin_key: "demo",
        provider_key: "provider",
        installation_key: "default",
        environment: "production",
        plugin_kind: "oauth",
        category: "developer",
        display_name: "Demo",
        description: "Demo plugin",
        transport: "http_rest",
        auth_type: "oauth",
        oauth_connect_url: "/api/connections/cloudflare/start",
        icon_url: "https://example.invalid/icon.png",
        icon_fit: "contain",
        composer_visible: 1,
        settings_visible: 1,
        is_enabled: 1,
        setup_status: "connected",
        health_strategy: "oauth_probe",
        health_status: "healthy",
        capabilities: ["provider.read"],
        tool_lanes: ["typed"],
        config: {
          disconnect_url: "/api/connections/cloudflare/disconnect",
          token_endpoint: "https://secret-authority.invalid/token",
        },
        metadata: { private_hint: "never-send" },
      },
      [{ plugin_id: "plg_demo" }],
    );

    assert.equal(safe.tool_count, 1);
    assert.equal(safe.disconnect_url, "/api/connections/cloudflare/disconnect");
    assert.equal(safe.is_enabled, true);
    assert.equal("config" in safe, false);
    assert.equal("metadata" in safe, false);
    assert.equal(JSON.stringify(safe).includes("secret-authority"), false);
    assert.equal(JSON.stringify(safe).includes("never-send"), false);
  });
});

describe("oauth-kind plugin state", () => {
  const plugin = { id: "plg_g", plugin_kind: "oauth", provider_key: "google_gmail", secret_ref: "oauth:google_gmail:a@b.c", setup_status: "unconfigured" };
  it("derives connection state from the matching user_oauth_tokens row", () => {
    const live = applyOauthPluginState(plugin, [{ provider: "google_gmail", account_identifier: "a@b.c", is_active: 1, revoked_at: null, last_refresh_error_code: null }]);
    assert.equal(live.setup_status, "connected");
    assert.equal(live.health_status, "healthy");
    assert.equal(live.connection_ref, "google_gmail:a@b.c");
    const failing = applyOauthPluginState(plugin, [{ provider: "google_gmail", account_identifier: "a@b.c", is_active: 1, revoked_at: null, last_refresh_error_code: "http_401" }]);
    assert.equal(failing.health_status, "auth_error");
    assert.equal(applyOauthPluginState(plugin, []).setup_status, "unconfigured");
    assert.equal(applyOauthPluginState({ ...plugin, plugin_kind: "mcp" }, []).setup_status, "unconfigured");
    const cloudflare = { ...plugin, provider_key:"cloudflare", plugin_kind:"oauth", setup_status:"connected", health_status:"healthy" };
    assert.equal(applyOauthPluginState(cloudflare, []).setup_status, "connected");
    assert.equal(applyOauthPluginState(cloudflare, []).health_status, "healthy");
  });
});
