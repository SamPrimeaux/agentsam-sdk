import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  applyAccountModelVisibilityPreferences,
  getStudioModelVisibilityPreferences,
  setStudioModelVisibilityPreference,
} from "./studio-model-preferences.ts";
import type { VaultD1Binding } from "./studio-vault.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE agentsam_user_ui_preferences (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      ui_preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(ui_preferences_json)),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO accounts (id) VALUES ('alice'), ('bob');
    INSERT INTO agentsam_user_ui_preferences (account_id,ui_preferences_json)
    VALUES ('alice','{"settings_general":{"openLastProject":true},"inneranimal_companions":{"activeId":"geaux"}}');
  `);
  const db: VaultD1Binding = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (...args: unknown[]) => args as never[];
      return {
        all<T>() { return Promise.resolve({ results: statement.all() as T[] }); },
        first<T>() { return Promise.resolve((statement.get() as T | undefined) ?? null); },
        run() { return Promise.resolve(statement.run()); },
        bind(...args: unknown[]) {
          const values = bound(...args);
          return {
            all<T>() { return Promise.resolve({ results: statement.all(...values) as T[] }); },
            first<T>() { return Promise.resolve((statement.get(...values) as T | undefined) ?? null); },
            run() { return Promise.resolve(statement.run(...values)); },
          };
        },
      };
    },
  };
  return { db, sqlite };
}

test("model visibility is stored per credential in the existing account preferences row", async () => {
  const { db, sqlite } = fixture();
  const env = { DB: db };
  await setStudioModelVisibilityPreference(env, "alice", {
    credentialId: "secret_primary", provider: "openai", modelId: "gpt-5.6", visible: false,
  });
  await setStudioModelVisibilityPreference(env, "alice", {
    credentialId: "secret_secondary", provider: "openai", modelId: "gpt-5.6", visible: false,
  });

  const preferences = await getStudioModelVisibilityPreferences(env, "alice");
  assert.deepEqual(preferences.secret_primary?.hidden_model_ids, ["gpt-5.6"]);
  assert.deepEqual(preferences.secret_secondary?.hidden_model_ids, ["gpt-5.6"]);
  assert.deepEqual(await getStudioModelVisibilityPreferences(env, "bob"), {});

  await setStudioModelVisibilityPreference(env, "alice", {
    credentialId: "secret_primary", provider: "openai", modelId: "gpt-5.6", visible: true,
  });
  const afterUnhide = await getStudioModelVisibilityPreferences(env, "alice");
  assert.equal(afterUnhide.secret_primary, undefined);
  assert.deepEqual(afterUnhide.secret_secondary?.hidden_model_ids, ["gpt-5.6"]);

  const stored = JSON.parse(sqlite.prepare(
    "SELECT ui_preferences_json FROM agentsam_user_ui_preferences WHERE account_id='alice'",
  ).get()?.ui_preferences_json as string);
  assert.equal(stored?.settings_general?.openLastProject, true);
  assert.equal(stored?.inneranimal_companions?.activeId, "geaux");
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_account_provider_models'",
  ).get()?.n, 0);
  sqlite.close();
});

test("hidden model on one key remains available when another key exposes it", async () => {
  const { db, sqlite } = fixture();
  const env = { DB: db };
  await setStudioModelVisibilityPreference(env, "alice", {
    credentialId: "secret_primary", provider: "openai", modelId: "gpt-5.6", visible: false,
  });
  const inventory = await applyAccountModelVisibilityPreferences(env, "alice", {
    credentialModels: [
      { credential_id: "secret_primary", provider: "openai", model_id: "gpt-5.6", availability_status: "available", availability: "available" },
      { credential_id: "secret_secondary", provider: "openai", model_id: "gpt-5.6", availability_status: "available", availability: "available" },
      { credential_id: "host:cloudflare", provider: "cloudflare", model_id: "@cf/example", availability: "binding_configured" },
    ],
  });
  assert.deepEqual(inventory.credentialModels?.map((row) => row.visible), [false, true, true]);
  assert.deepEqual(inventory.availableModels?.map((row) => `${row.provider}:${row.model_id}`), [
    "openai:gpt-5.6",
    "cloudflare:@cf/example",
  ]);
  sqlite.close();
});
