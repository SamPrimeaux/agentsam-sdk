import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProviderId, planProviderSync } from "./device-sync.ts";

const local = (
  overrides: Partial<{
    exists: boolean;
    last4: string | null;
    synced_secret_id: string | null;
    synced_last4: string | null;
  }> = {},
) => ({
  exists: false,
  last4: null,
  synced_secret_id: null,
  synced_last4: null,
  ...overrides,
});

test("provider aliases converge on canonical ids", () => {
  assert.equal(canonicalProviderId("google"), "gemini");
  assert.equal(canonicalProviderId("grok"), "xai");
  assert.equal(canonicalProviderId("openai"), "openai");
});

test("account vault is authoritative for signed-in device reconciliation", () => {
  assert.equal(planProviderSync(local(), { id: "usec_1", last4: "1234" }), "pull");
  assert.equal(
    planProviderSync(local({ exists: true, last4: "9999" }), { id: "usec_1", last4: "1234" }),
    "pull",
  );
  assert.equal(
    planProviderSync(
      local({ exists: true, last4: "1234", synced_secret_id: "usec_old", synced_last4: "1234" }),
      { id: "usec_new", last4: "1234" },
    ),
    "pull",
  );
});

test("legacy local-only keys migrate upward but deleted synced keys clear locally", () => {
  assert.equal(planProviderSync(local({ exists: true, last4: "1234" }), null), "push");
  assert.equal(
    planProviderSync(
      local({ exists: true, last4: "1234", synced_secret_id: "usec_1", synced_last4: "1234" }),
      null,
    ),
    "delete_local",
  );
});

test("matching account and native marker need no sync", () => {
  assert.equal(
    planProviderSync(
      local({ exists: true, last4: "1234", synced_secret_id: "usec_1", synced_last4: "1234" }),
      { id: "usec_1", last4: "1234" },
    ),
    "none",
  );
});
