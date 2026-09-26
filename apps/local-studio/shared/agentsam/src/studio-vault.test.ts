import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertInventoryResponseSafe,
  credentialPlaneFor,
  decryptVaultSecret,
  encryptVaultSecret,
  loadVaultCredentialMap,
  mergeStudioCredentials,
  platformCredentialFor,
  resolveStudioAccountId,
  serviceToProvider,
  shouldUseWorkersAI,
  studioServerBindings,
  vaultAad,
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
        bind() {
          return {
            async all<T>(): Promise<{ results?: T[] }> {
              return { results: rows as T[] };
            },
          };
        },
      };
    },
  };
}

describe("serviceToProvider", () => {
  it("maps vault service names to Studio providers", () => {
    assert.equal(serviceToProvider("openai"), "openai");
    assert.equal(serviceToProvider("anthropic"), "anthropic");
    assert.equal(serviceToProvider("gemini"), "gemini");
    assert.equal(serviceToProvider("google"), "gemini");
    assert.equal(serviceToProvider("xai"), "grok");
    assert.equal(serviceToProvider("grok"), "grok");
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
        },
      ]),
      accountId,
      masterKey: MASTER_V1,
      cloudflareAccountId: "ede6590ac0d2fb7daf155b35653457b2",
    });
    assert.equal(
      map.get("cloudflare")?.cloudflare_account_id,
      "ede6590ac0d2fb7daf155b35653457b2",
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
