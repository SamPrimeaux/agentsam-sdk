import { describe, it } from "node:test";
import { sealLegacyIamOauthToken } from "@inneranimalmedia/agentsam-vault";
import assert from "node:assert/strict";
import {
  assertInventoryResponseSafe,
  credentialPlaneFor,
  decryptVaultSecret,
  encryptVaultSecret,
  loadModelProviderDefinitions,
  loadVaultCredentialMap,
  loadVaultCredentialRecords,
  mergeStudioCredentials,
  platformCredentialFor,
  resolveStudioAccountId,
  serviceToProvider,
  shouldUseWorkersAI,
  studioServerBindings,
  withStudioWorkerBindings,
  vaultAad,
  vaultCredentialRecordsForAccount,
  vaultCredentialsForAccount,
} from "./studio-vault.ts";
import type { VaultD1Binding } from "./studio-vault.ts";

const MASTER_RAW_B64 = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
assert.equal(Buffer.from(MASTER_RAW_B64, "base64").length, 32);
/** Same format the Worker / ensure-vault-secret.mjs require. */
const MASTER_V1 = `v1.${MASTER_RAW_B64}`;

function fakeDb(rows: unknown[]): VaultD1Binding {
  return {
    prepare() {
      return {
        async all<T>(): Promise<{ results?: T[] }> {
          return { results: rows as T[] };
        },
        async first<T>(): Promise<T | null> {
          return (rows[0] as T | undefined) ?? null;
        },
        async run(): Promise<unknown> {
          return { success: true };
        },
        bind() {
          return {
            async all<T>(): Promise<{ results?: T[] }> {
              return { results: rows as T[] };
            },
            async first<T>(): Promise<T | null> {
              return (rows[0] as T | undefined) ?? null;
            },
            async run(): Promise<unknown> {
              return { success: true };
            },
          };
        },
      };
    },
  };
}

describe("loadModelProviderDefinitions", () => {
  it("uses service-registry metadata to select real provider discovery adapters", async () => {
    const rows = [
      { service_name: "meta", label: "Meta Model API", kind: "ai_provider", metadata_json: JSON.stringify({
        provider_id: "meta", credential_kind: "provider_api_key",
        model_discovery: { enabled: true, adapter: "meta" },
      }) },
      { service_name: "openai", label: "OpenAI", kind: "ai_provider", metadata_json: JSON.stringify({
        provider_id: "openai", model_discovery: { enabled: true, adapter: "openai" },
      }) },
      { service_name: "google", label: "Google AI", kind: "ai_provider", metadata_json: JSON.stringify({
        provider_id: "gemini", model_discovery: { enabled: true, adapter: "gemini" },
      }) },
      { service_name: "gemini", label: "Gemini", kind: "ai_provider", metadata_json: JSON.stringify({
        provider_id: "gemini", model_discovery: { enabled: true, adapter: "gemini" },
      }) },
      { service_name: "meshy", label: "Meshy", kind: "ai_provider", metadata_json: JSON.stringify({
        provider_id: "meshy", model_discovery: { enabled: false },
      }) },
    ];
    const db = {
      prepare(sql: string) {
        assert.match(sql, /FROM agentsam_service_registry/);
        return { async all() { return { results: rows }; } };
      },
    };
    const definitions = await loadModelProviderDefinitions(db as never);
    assert.deepEqual(definitions.map((row) => [row.id, row.service, row.adapter]), [
      ["gemini", "gemini", "gemini"],
      ["meta", "meta", "meta"],
      ["openai", "openai", "openai"],
    ]);
  });
});

describe("serviceToProvider", () => {
  it("maps vault service names to Studio providers", () => {
    assert.equal(serviceToProvider("openai"), "openai");
    assert.equal(serviceToProvider("anthropic"), "anthropic");
    assert.equal(serviceToProvider("gemini"), "gemini");
    assert.equal(serviceToProvider("google"), "gemini");
    assert.equal(serviceToProvider("xai"), "xai");
    assert.equal(serviceToProvider("grok"), "xai");
    assert.equal(serviceToProvider("cursor"), "cursor");
    assert.equal(serviceToProvider("cloudflare"), "cloudflare");
    assert.equal(serviceToProvider("OPENAI"), "openai");
  });

  it("returns null for unknown services", () => {
    assert.equal(serviceToProvider("github"), null);
    assert.equal(serviceToProvider(""), null);
    assert.equal(serviceToProvider(null), null);
  });
});

describe("vault AES-256-GCM contract", () => {
  it("round-trips with matching AAD", async () => {
    const aad = vaultAad("au_1", "openai", "default");
    const ciphertext = await encryptVaultSecret("sk-test-secret-value", aad, MASTER_V1);
    assert.equal(await decryptVaultSecret(ciphertext, aad, MASTER_V1), "sk-test-secret-value");
  });

  it("rejects the wrong AAD", async () => {
    const ciphertext = await encryptVaultSecret(
      "sk-test-secret-value",
      vaultAad("au_1", "openai", "default"),
      MASTER_V1,
    );
    await assert.rejects(
      decryptVaultSecret(ciphertext, vaultAad("au_2", "openai", "default"), MASTER_V1),
    );
  });

  it("rejects the wrong master key", async () => {
    const ciphertext = await encryptVaultSecret(
      "sk-test-secret-value",
      vaultAad("au_1", "openai", "default"),
      MASTER_V1,
    );
    await assert.rejects(
      decryptVaultSecret(ciphertext, vaultAad("au_1", "openai", "default"), "wrong-passphrase"),
    );
  });

  it("aad format matches the Worker contract", () => {
    assert.equal(vaultAad("au", "openai", "n"), "au:openai:n");
  });
});

describe("loadVaultCredentialMap", () => {
  it("unwraps rows vault-first with first-row-wins", async () => {
    const accountId = "au_1";
    const mk = async (service: string, name: string, value: string) => ({
      id: `row_${service}_${name}`,
      secret_name: name,
      service_name: service,
      secret_value_encrypted: await encryptVaultSecret(
        value,
        vaultAad(accountId, service, name),
        MASTER_V1,
      ),
      metadata_json: JSON.stringify({ aad_bound: 1, key_version: 1 }),
    });
    const rows = [
      await mk("openai", "default", "sk-user-first"),
      await mk("openai", "second", "sk-user-second"),
      await mk("gemini", "default", "gemini-user-key"),
      { secret_name: "x", service_name: "github", secret_value_encrypted: "deadbeef" },
    ];
    const map = await loadVaultCredentialMap({
      db: fakeDb(rows),
      accountId,
      masterKey: MASTER_V1,
    });
    assert.equal(map.get("openai")?.value, "sk-user-first");
    assert.equal(map.get("openai")?.source, "user_vault");
    assert.equal(map.get("gemini")?.value, "gemini-user-key");
    assert.equal(map.has("github"), false);
  });

  it("retains every account-owned key with its own credential identity", async () => {
    const accountId = "au_1";
    const mk = async (name: string, value: string) => ({
      id: "secret_" + name,
      secret_name: name,
      service_name: "openai",
      secret_value_encrypted: await encryptVaultSecret(
        value,
        vaultAad(accountId, "openai", name),
        MASTER_V1,
      ),
      metadata_json: JSON.stringify({ aad_bound: 1, last4: value.slice(-4) }),
    });
    const records = await loadVaultCredentialRecords({
      db: fakeDb([await mk("primary", "sk-primary-1234"), await mk("secondary", "sk-secondary-5678")]),
      accountId,
      masterKey: MASTER_V1,
    });
    assert.deepEqual(records.map((record) => record.id), ["secret_primary", "secret_secondary"]);
    assert.deepEqual(records.map((record) => record.name), ["primary", "secondary"]);
    assert.deepEqual(records.map((record) => record.last4), ["1234", "5678"]);
    assert.deepEqual(records.map((record) => record.provider), ["openai", "openai"]);
    assert.ok(records.every((record) => record.source === "user_vault"));
    assert.deepEqual(records.map((record) => record.value), ["sk-primary-1234", "sk-secondary-5678"]);
  });

  it("opens legacy IAM rows only with verified provenance, via MASTER or VAULT_KEY", async () => {
    const legacyKey = "legacy-env-string";
    const legacy = await sealLegacyIamOauthToken(legacyKey, "sk-legacy-row");
    const row = (metadata_json: string | null) => ({
      id: "row_legacy",
      secret_name: "api_key:openai:uak_x",
      service_name: "openai",
      secret_value_encrypted: legacy,
      metadata_json,
    });
    const load = (r: ReturnType<typeof row>, extra: { legacyKey?: string } = {}) =>
      loadVaultCredentialMap({ db: fakeDb([r]), accountId: "au_1", masterKey: MASTER_V1, ...extra });
    const verified = JSON.stringify({ migrated_from: "user_api_keys" });
    // Verified legacy provenance + the legacy key candidate opens it.
    assert.equal((await load(row(verified), { legacyKey })).get("openai")?.value, "sk-legacy-row");
    // Without the legacy key candidate it fails closed.
    assert.equal((await load(row(verified))).has("openai"), false);
    // Unknown provenance never opens, even with the right key.
    assert.equal((await load(row(null), { legacyKey })).has("openai"), false);
    assert.equal((await load(row("{}"), { legacyKey })).has("openai"), false);
    // The same ciphertext claiming to be AAD-bound must not fall back to the unbound format.
    assert.equal((await load(row(JSON.stringify({ aad_bound: 1 })), { legacyKey })).has("openai"), false);
  });

  it("skips rows that fail to decrypt", async () => {
    const map = await loadVaultCredentialMap({
      db: fakeDb([
        { secret_name: "n", service_name: "openai", secret_value_encrypted: "!!!not-ciphertext!!!" },
      ]),
      accountId: "au_1",
      masterKey: MASTER_V1,
    });
    assert.equal(map.size, 0);
  });

  it("attaches CLOUDFLARE_ACCOUNT_ID on cloudflare rows", async () => {
    const accountId = "au_1";
    const map = await loadVaultCredentialMap({
      db: fakeDb([
        {
          secret_name: "default",
          service_name: "cloudflare",
          secret_value_encrypted: await encryptVaultSecret(
            "cf-token",
            vaultAad(accountId, "cloudflare", "default"),
            MASTER_V1,
          ),
          metadata_json: JSON.stringify({ aad_bound: 1 }),
        },
      ]),
      accountId,
      masterKey: MASTER_V1,
      cloudflareAccountId: "demo-commerce-account",
    });
    assert.equal(
      map.get("cloudflare")?.cloudflare_account_id,
      "demo-commerce-account",
    );
  });
});

describe("merge + platform", () => {
  it("vault wins, platform fills gaps", () => {
    const merged = mergeStudioCredentials(
      new Map([["openai", { value: "sk-user", source: "user_vault" }]]),
      new Map([
        ["openai", { value: "sk-platform", source: "platform" }],
        ["gemini", { value: "gem-platform", source: "platform" }],
      ]),
    );
    assert.equal(merged.get("openai")?.value, "sk-user");
    assert.equal(merged.get("gemini")?.value, "gem-platform");
  });

  it("platformCredentialFor reads desk secrets", () => {
    assert.deepEqual(platformCredentialFor("openai", { OPENAI_API_KEY: "sk-p" }), {
      value: "sk-p",
      source: "platform",
    });
    assert.equal(platformCredentialFor("openai", {})?.value ?? null, null);
    assert.deepEqual(
      platformCredentialFor("cloudflare", {
        CLOUDFLARE_API_TOKEN: "tok",
        CLOUDFLARE_ACCOUNT_ID: "cfacct",
      }),
      { value: "tok", source: "platform", cloudflare_account_id: "cfacct" },
    );
  });

  it("credentialPlaneFor labels mixed / studio_vault / platform", () => {
    assert.equal(
      credentialPlaneFor(
        new Map([
          ["openai", { value: "a", source: "user_vault" }],
          ["gemini", { value: "b", source: "platform" }],
        ]),
      ),
      "mixed",
    );
    assert.equal(
      credentialPlaneFor(new Map([["openai", { value: "a", source: "user_vault" }]])),
      "studio_vault",
    );
    assert.equal(credentialPlaneFor(new Map()), "platform");
  });
});

describe("workers AI routing", () => {
  it("routes cloudflare through the binding only", () => {
    assert.equal(shouldUseWorkersAI("cloudflare", {}), true);
    assert.equal(shouldUseWorkersAI("cloudflare", null), false);
    assert.equal(shouldUseWorkersAI("openai", {}), false);
  });
});

describe("identity + bindings", () => {
  it("resolveStudioAccountId reads the asserted header", () => {
    assert.equal(
      resolveStudioAccountId(new Request("https://x/", { headers: { "x-user-id": " au_1 " } })),
      "au_1",
    );
    assert.equal(resolveStudioAccountId(new Request("https://x/")), "");
  });

  it("studioServerBindings never throws", () => {
    const bindings = studioServerBindings(null);
    assert.equal(bindings.db, null);
    assert.equal(bindings.workersAI, null);
  });

  it("preserves Worker bindings in concurrent Nitro requests without leaking them", async () => {
    // Separately emitted bundles evaluate the module more than once.
    const nitro = await import(new URL("./studio-vault.ts?nitro-test", import.meta.url).href) as typeof import("./studio-vault.ts");
    const dbA = fakeDb([{service_name:"gemini",label:"Gemini",kind:"ai_provider",
      metadata_json:'{"provider_id":"gemini","model_discovery":{"enabled":true,"adapter":"gemini"}}'}]);
    const dbB = fakeDb([]);
    const [a, b] = await Promise.all([
      withStudioWorkerBindings({ DB: dbA, GEMINI_API_KEY: "test-a" }, async () => {
        await Promise.resolve();
        return nitro.studioServerBindings({ context: {} });
      }),
      withStudioWorkerBindings({ DB: dbB, GEMINI_API_KEY: "test-b" }, async () => {
        await Promise.resolve();
        return nitro.studioServerBindings(null);
      }),
    ]);
    assert.equal(a.db, dbA);
    assert.equal(b.db, dbB);
    assert.equal(a.env.GEMINI_API_KEY, "test-a");
    assert.equal(b.env.GEMINI_API_KEY, "test-b");
    assert.deepEqual(await loadModelProviderDefinitions(a.db), [{id:"gemini",label:"Gemini",service:"gemini",adapter:"gemini"}]);
    assert.deepEqual(await loadModelProviderDefinitions(b.db), []);
    assert.equal(studioServerBindings(null).db, null);
  });

  it("vaultCredentialRecordsForAccount returns an empty array without bindings", async () => {
    const empty = await vaultCredentialRecordsForAccount(studioServerBindings(null), "au_1");
    assert.deepEqual(empty, []);
  });

  it("vaultCredentialsForAccount returns empty without bindings", async () => {
    const empty = await vaultCredentialsForAccount(studioServerBindings(null), "au_1");
    assert.equal(empty.size, 0);
  });
});

describe("inventory sanitizer", () => {
  it("accepts provenance-only payloads", () => {
    assertInventoryResponseSafe({
      ok: true,
      providers: [{ id: "openai", configured: true, source: "user_vault" }],
    });
  });

  it("rejects embedded secret material", () => {
    assert.throws(() => assertInventoryResponseSafe({ value: "sk-abc1234567890xyz" }));
  });
});
