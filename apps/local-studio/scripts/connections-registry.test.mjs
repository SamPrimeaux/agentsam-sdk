import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BYOK_PROVIDER_DEFINITIONS,
  loadConnectionsRegistry,
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
          return sql.includes("agentsam_cloudflare_connections") ? cloudflare : null;
        },
        async all() {
          return sql.includes("user_secrets") ? { results: secrets } : { results: [] };
        },
        async run() {
          return { success: true };
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
            connection_id: "cfconn_1",
            owner_id: "user_1",
            cloudflare_account_id: "account_1",
            scopes: "d1.read workers-scripts.write",
            status: "connected",
            created_at: 1,
            updated_at: 2,
            expires_at: 3,
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
});
