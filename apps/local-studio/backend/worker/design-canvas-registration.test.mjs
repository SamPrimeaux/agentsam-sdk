import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { projectSideStageContribution } from './plugin-side-stages.js';

const sql = readFileSync(new URL('../migrations/1359_design_canvas_installable_app.sql', import.meta.url), 'utf8');

test('Design Canvas registration uses live D1 family constraints and is idempotent', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agentsam_plugins (
      id TEXT PRIMARY KEY DEFAULT ('plg_' || lower(hex(randomblob(8)))),
      plugin_key TEXT NOT NULL UNIQUE,
      family_key TEXT NOT NULL CHECK (family_key IN ('core','connections','commerce','build','brand-campaign')),
      provider_key TEXT NOT NULL,
      plugin_kind TEXT NOT NULL CHECK (plugin_kind IN ('mcp','api','oauth','native','webhook','database','storage','ai')),
      category TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      transport TEXT NOT NULL CHECK (transport IN ('remote_jsonrpc','iam_mcp_catalog','http_rest','http_graphql','webhook','workers_binding','native','none')),
      auth_type TEXT NOT NULL CHECK (auth_type IN ('none','bridge','oauth','oauth_via_iam','bearer_secret','api_key_secret','workers_binding')),
      capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
      metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
      sort_priority INTEGER NOT NULL,
      composer_visible INTEGER NOT NULL,
      settings_visible INTEGER NOT NULL,
      health_strategy TEXT NOT NULL CHECK (health_strategy IN ('none','adapter','mcp_ping','oauth_probe','provider_probe'))
    );`);
    db.exec(sql);
    db.exec(sql);
    const row = db.prepare('SELECT * FROM agentsam_plugins').get();
    assert.equal(db.prepare('SELECT count(*) n FROM agentsam_plugins').get().n, 1);
    assert.equal(row.plugin_key, 'agentsam-design-canvas');
    assert.equal(row.family_key, 'build');
    const details = projectSideStageContribution(row);
    assert.equal(details?.renderer, 'embed');
    assert.equal(details?.href, 'https://agentsam.inneranimalmedia.com/design-canvas/');
    assert.deepEqual(JSON.parse(row.metadata_json).app.surfaces, ['admin-nav','add-apps']);
  } finally { db.close(); }
});
