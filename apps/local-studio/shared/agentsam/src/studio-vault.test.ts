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
  resolveStudioUserId,
  serviceToProvider,
  shouldUseWorkersAI,
  studioServerBindings,
  vaultAad,
  vaultCredentialsForUser,
} from "./studio-vault.ts";
import type { VaultD1Binding } from "./studio-vault.ts";

// 32-byte master key material (base64), generated for tests only.
const MASTER_B64 = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
assert.equal(Buffer.from(MASTER_B64, "base64").length, 32);

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
    const aad = vaultAad("user_1", "openai", "default");
    const ciphertext = await encryptVaultSecret("sk-test-secret-value", aad, MASTER_B64);
    assert.equal(await decryptVaultSecret(ciphertext, aad, MASTER_B64), "sk-test-secret-value");
  });

  it("rejects the wrong AAD", async () => {
    const ciphertext = await encryptVaultSecret("sk-test-secret-value", vaultAad("user_1", "openai", "default"), MASTER_B64);
    await assert.rejects(decryptVaultSecret(ciphertext, vaultAad("user_2", "openai", "default"), MASTER_B64));
  });

  it("rejects the wrong master key", async () => {
    const ciphertext = await encryptVaultSecret("sk-test-secret-value", vaultAad("user_1", "openai", "default"), MASTER_B64);
    await assert.rejects(decryptVaultSecret(ciphertext, vaultAad("user_1", "openai", "default"), "wrong-passphrase"));
  });

  it("supports short passphrase key material (SHA-256 path)", async () => {
    const aad = vaultAad("user_1", "gemini", "default");
    const ciphertext = await encryptVaultSecret("gemini-key", aad, "short-passphrase");
    assert.equal(await decryptVaultSecret(ciphertext, aad, "short-passphrase"), "gemini-key");
  });

  it("aad format matches the Worker contract", () => {
    assert.equal(vaultAad("u", "openai", "n"), "u:openai:n");
  });
});

describe("loadVaultCredentialMap", () => {
  it("unwraps rows vault-first with first-row-wins", async () => {
    const userId = "user_1";
    const mk = async (service: string, name: string, value: string) => ({
      id: `row_${service}_${name}`,
      secret_name: name,
      service_name: service,
      secret_value_encrypted: await encryptVaultSecret(value, vaultAad(userId, service, name), MASTER_B64),
    });
    const rows = [
      await mk("openai", "default", "sk-user-first"),
      await mk("openai", "second", "sk-user-second"),
      await mk("gemini", "default", "gemini-user-key"),
      { secret_name: "x", service_name: "github", secret_value_encrypted: "deadbeef" },
    ];
    const map = await loadVaultCredentialMap({
      db: fakeDb(rows),
      userId,
      masterKey: MASTER_B64,
      accountId: "acct_1",
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
      userId: "user_1",
      masterKey: MASTER_B64,
    });
    assert.equal(map.size, 0);
  });

  it("attaches the Cloudflare account id", async () => {
    const userId = "user_1";
    const map = await loadVaultCredentialMap({
      db: fakeDb([
        {
          secret_name: "default",
          service_name: "cloudflare",
          secret_value_encrypted: await encryptVaultSecret("cf-token", vaultAad(userId, "cloudflare", "default"), MASTER_B64),
        },
      ]),
      userId,
      masterKey: MASTER_B64,
      accountId: "acct_9",
    });
    assert.equal(map.get("cloudflare")?.account_id, "acct_9");
  });
});

describe("merge + platform fallback", () => {
  it("vault wins, platform fills gaps", () => {
    const merged = mergeStudioCredentials(
      new Map([["openai", { value: "sk-user", source: "user_vault" }]]),
      new Map([
        ["openai", { value: "sk-platform", source: "platform" }],
        ["gemini", { value: "gem-platform", source: "platform" }],
      ]),
    );
    assert.equal(merged.get("openai")?.value, "sk-user");
    assert.equal(merged.get("openai")?.source, "user_vault");
    assert.equal(merged.get("gemini")?.value, "gem-platform");
  });

  it("platformCredentialFor reads desk secrets with xai alias", () => {
    assert.deepEqual(platformCredentialFor("openai", { OPENAI_API_KEY: "sk-p" }), {
      value: "sk-p",
      source: "platform",
    });
    assert.equal(platformCredentialFor("grok", { XAI_API_KEY: "xai-p" })?.value, "xai-p");
    assert.equal(platformCredentialFor("xai", { XAI_API_KEY: "xai-p" })?.value, "xai-p");
    assert.equal(platformCredentialFor("openai", {})?.value ?? null, null);
    assert.equal(platformCredentialFor("nope", { OPENAI_API_KEY: "x" }), null);
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
    assert.equal(shouldUseWorkersAI("Cloudflare", {}), true);
    assert.equal(shouldUseWorkersAI("cloudflare", null), false);
    assert.equal(shouldUseWorkersAI("openai", {}), false);
  });
});

describe("identity + bindings", () => {
  it("resolveStudioUserId reads the asserted header", () => {
    assert.equal(resolveStudioUserId(new Request("https://x/", { headers: { "x-user-id": " user_1 " } })), "user_1");
    assert.equal(resolveStudioUserId(new Request("https://x/")), "");
  });

  it("studioServerBindings never throws and defaults to process.env", () => {
    const bindings = studioServerBindings(null);
    assert.equal(bindings.db, null);
    assert.equal(bindings.workersAI, null);
    assert.equal(typeof bindings.env, "object");
  });

  it("vaultCredentialsForUser falls back to empty without bindings", async () => {
    const empty = await vaultCredentialsForUser(studioServerBindings(null), "user_1");
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

  it("rejects embedded credential values", () => {
    assert.throws(() =>
      assertInventoryResponseSafe({ providers: [{ id: "openai", value: "sk-secret" }] }),
    );
    assert.throws(() => assertInventoryResponseSafe({ note: "key sk-abcdefghij1234 here" }));
  });
});
