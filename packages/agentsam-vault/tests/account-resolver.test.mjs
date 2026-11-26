import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptVaultSecret,
  importVaultMasterKey,
  mintVaultMasterKeyV1,
  resolveAccountCredential,
} from "../src/index.js";

async function makeRow(accountId, provider, secret, masterKey) {
  const secretName = "CAPP_KEY";
  const aad = `${accountId}:${provider}:${secretName}`;
  return {
    id: "usec_account_resolver_test",
    account_id: accountId,
    secret_name: secretName,
    service_name: provider,
    kind: "provider_key",
    is_active: 1,
    secret_value_encrypted: await encryptVaultSecret(await importVaultMasterKey(masterKey), secret, aad),
    metadata_json: JSON.stringify({ aad_bound: true, last4: secret.slice(-4) }),
  };
}

function makeDb(row) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          const [accountId, provider, kind, secretName] = this.values;
          return row && row.account_id === accountId && row.service_name === provider &&
            row.kind === kind && row.is_active === 1 && (!secretName || row.secret_name === secretName)
            ? row : null;
        },
        async run() { writes.push({ sql, values: this.values }); return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

test("account resolver decrypts only the requested provider credential and records use", async () => {
  const masterKey = mintVaultMasterKeyV1();
  const row = await makeRow("au_one", "completeful", "capp_live_private_key", masterKey);
  const db = makeDb(row);
  const result = await resolveAccountCredential({
    env: { VAULT_MASTER_KEY: masterKey }, db, accountId: "au_one", provider: "completeful",
    actor: "ecommerce:completeful",
  });
  assert.equal(result.source, "vault");
  assert.equal(result.value, "capp_live_private_key");
  assert.equal(result.last4, "_key");
  assert.equal(result.accountId, "au_one");
  assert.equal(result.provider, "completeful");
  assert.equal(Object.isFrozen(result), true);
  assert.ok(db.writes.some((entry) => entry.sql.includes("UPDATE user_secrets")));
  assert.ok(db.writes.some((entry) => entry.sql.includes("INSERT INTO secret_audit_log")));
  assert.equal(JSON.stringify(db.writes).includes("capp_live_private_key"), false);
});

test("account resolver refuses another account's provider credential", async () => {
  const masterKey = mintVaultMasterKeyV1();
  const row = await makeRow("au_one", "completeful", "capp_live_private_key", masterKey);
  const result = await resolveAccountCredential({
    env: { VAULT_MASTER_KEY: masterKey }, db: makeDb(row), accountId: "au_two", provider: "completeful",
  });
  assert.equal(result, null);
});

test("account resolver refuses inactive and wrong-kind vault rows", async () => {
  const masterKey = mintVaultMasterKeyV1();
  const row = await makeRow("au_one", "completeful", "capp_live_private_key", masterKey);
  row.is_active = 0;
  assert.equal(await resolveAccountCredential({ env: { VAULT_MASTER_KEY: masterKey }, db: makeDb(row), accountId: "au_one", provider: "completeful" }), null);
  row.is_active = 1;
  row.kind = "credential_bundle";
  assert.equal(await resolveAccountCredential({ env: { VAULT_MASTER_KEY: masterKey }, db: makeDb(row), accountId: "au_one", provider: "completeful" }), null);
});

test("account resolver fails closed when authenticated vault ciphertext cannot be opened", async () => {
  const masterKey = mintVaultMasterKeyV1();
  const wrongMasterKey = mintVaultMasterKeyV1();
  const row = await makeRow("au_one", "completeful", "capp_live_private_key", masterKey);
  await assert.rejects(
    resolveAccountCredential({ env: { VAULT_MASTER_KEY: wrongMasterKey }, db: makeDb(row), accountId: "au_one", provider: "completeful" }),
    (error) => error.code === "vault_decrypt_failed",
  );
});
