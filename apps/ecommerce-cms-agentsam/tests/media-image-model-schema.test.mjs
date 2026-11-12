import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { listEditableImageModels } from "../backend/media/image-operations.js";

test("Product Studio image discovery queries real production model columns", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE agentsam_model_catalog (
        model_key TEXT PRIMARY KEY, display_name TEXT, provider TEXT,
        api_platform TEXT, is_active INTEGER, show_in_picker INTEGER
      );
      INSERT INTO agentsam_model_catalog VALUES
        ('gpt-image-ready','Ready model','openai','openai_images',1,1),
        ('gpt-image-hidden','Hidden model','openai','openai_images',1,0),
        ('gpt-image-retired','Retired model','openai','openai_images',0,1),
        ('gpt-text','Text model','openai','openai_responses',1,1),
        ('gemini-image','Other provider','google','gemini_api',1,1);
    `);
    const db = {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return { async all() { return { results: statement.all() }; } };
      },
    };
    assert.deepEqual((await listEditableImageModels({ DB: db, OPENAI_API_KEY: "test-only" })).map((row) => ({ ...row })),
      [{ id: "gpt-image-ready", name: "Ready model" }]);
    assert.deepEqual(await listEditableImageModels({ DB: db }), [],
      "No uncredentialed inference model is offered");
  } finally {
    sqlite.close();
  }
});
