import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptVaultSecret,
  importVaultMasterKey,
  mintVaultMasterKeyV1,
} from "@inneranimalmedia/agentsam-vault";
import { withLocalStudioCmsContext } from "../backend/lib/account-context.js";
import {
  assertCompletefulMutationAllowed,
  completefulKeyMode,
  completefulWritesEnabled,
  resolveCompletefulCredential,
} from "../backend/completeful/client.js";

async function vaultRow(accountId, key, masterKey) {
  const serviceName = "completeful";
  const secretName = "CAPP_KEY";
  const aad = `${accountId}:${serviceName}:${secretName}`;
  const encrypted = await encryptVaultSecret(await importVaultMasterKey(masterKey), key, aad);
  return {
    id: "usecret_completeful_1",
    account_id: accountId,
    secret_name: secretName,
    service_name: serviceName,
    kind: "provider_key",
    is_active: 1,
    secret_value_encrypted: encrypted,
    metadata_json: JSON.stringify({ aad_bound: true, last4: key.slice(-4) }),
  };
}

function vaultEnv(row, masterKey, extras = {}) {
  const writes = [];
  const env = {
    VAULT_MASTER_KEY: masterKey,
    DB: {
      prepare(sql) {
        const statement = {
          values: [],
          bind(...values) { this.values = values; return this; },
          async first() {
            if (sql.includes("FROM user_secrets") && sql.includes("secret_value_encrypted")) {
              const [accountId, serviceName, kind, secretName] = this.values;
              return row && row.account_id === accountId && row.service_name === serviceName &&
                row.kind === kind && row.is_active === 1 && (!secretName || row.secret_name === secretName)
                ? row : null;
            }
            throw new Error(`Unexpected vault query: ${sql}`);
          },
          async run() { writes.push({ sql, values: this.values }); return { meta: { changes: 1 } }; },
        };
        return statement;
      },
    },
    ...extras,
  };
  return { env, writes };
}

test("Completeful resolves the live key from the authenticated account vault", async () => {
  const accountId = "au_completeful_test";
  const masterKey = mintVaultMasterKeyV1();
  const row = await vaultRow(accountId, "capp_live_account_key", masterKey);
  const { env, writes } = vaultEnv(row, masterKey, { COMPLETEFUL_ALLOW_LIVE_WRITES: false });

  await withLocalStudioCmsContext(accountId, null, async () => {
    const credential = await resolveCompletefulCredential(env);
    assert.equal(credential.source, "vault");
    assert.equal(credential.value, "capp_live_account_key");
    assert.equal(completefulKeyMode(credential.value), "live");
    assert.equal(completefulWritesEnabled(credential.value), true);
    const authorization = await assertCompletefulMutationAllowed(env);
    assert.deepEqual(authorization, { mode: "live", source: "vault" });
  });

  assert.ok(writes.some((entry) => entry.sql.includes("UPDATE user_secrets")));
  assert.ok(writes.some((entry) => entry.sql.includes("INSERT INTO secret_audit_log")));
  assert.equal(JSON.stringify(writes).includes("capp_live_account_key"), false);
});

test("a missing account vault credential never falls back to a global Worker key", async () => {
  const masterKey = mintVaultMasterKeyV1();
  const { env } = vaultEnv(null, masterKey, { CAPP_KEY: "capp_live_platform_key" });
  await withLocalStudioCmsContext("au_without_completeful", null, async () => {
    assert.equal(await resolveCompletefulCredential(env), null);
    await assert.rejects(assertCompletefulMutationAllowed(env), (error) => error.code === "completeful_not_configured");
  });
});

test("vault decryption failure does not fall back to a Worker secret", async () => {
  const accountId = "au_bad_vault";
  const wrongMaster = mintVaultMasterKeyV1();
  const actualMaster = mintVaultMasterKeyV1();
  const row = await vaultRow(accountId, "capp_live_account_key", actualMaster);
  const { env } = vaultEnv(row, wrongMaster, { CAPP_KEY: "capp_live_platform_key" });
  await withLocalStudioCmsContext(accountId, null, async () => {
    await assert.rejects(resolveCompletefulCredential(env), (error) => error.code === "vault_decrypt_failed" || error.code === "completeful_vault_unavailable");
  });
});

test("standalone installs retain their explicit environment compatibility lane", async () => {
  const env = { CAPP_KEY: "capp_test_standalone_key" };
  const credential = await resolveCompletefulCredential(env);
  assert.equal(credential.source, "environment");
  assert.equal(credential.value, "capp_test_standalone_key");
  assert.equal(completefulKeyMode(credential.value), "test");
});
