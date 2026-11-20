import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  ThemeScenesSections,
  createCmsScenePage,
  readCmsScenePage,
  createCmsSceneArtifactManifest,
  validateCmsSceneArtifactManifest,
} from '../packages/theme-contract/runtime/theme-scenes-sections.mjs';
import { getCmsSectionRenderer } from '../backend/cms/section-renderer-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(path.join(root, 'db/migrations/009_theme_scenes_portable_sections.sql'), 'utf8');

function migrationDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE cms_definitions (
      id TEXT PRIMARY KEY, account_id TEXT, definition_key TEXT, kind TEXT, label TEXT,
      description TEXT, category TEXT, origin TEXT, version TEXT, settings_schema_json TEXT,
      allowed_blocks_json TEXT, max_blocks INTEGER, metadata_json TEXT, status TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE cms_components (
      id TEXT PRIMARY KEY, definition_id TEXT UNIQUE REFERENCES cms_definitions(id),
      renderer_key TEXT, delivery_mode TEXT, source_ref TEXT, capabilities_json TEXT,
      compatibility_json TEXT, verification_json TEXT, implementation_status TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE cms_component_templates (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE, template_name TEXT, template_type TEXT,
      category TEXT, status TEXT, label TEXT, tags TEXT, template_data TEXT, is_system INTEGER,
      slug TEXT, sort_order INTEGER, is_featured INTEGER, featured_collection TEXT,
      item_type TEXT, definition_id TEXT REFERENCES cms_definitions(id), definition_key TEXT,
      definition_version TEXT, editor_schema_json TEXT, compatibility_json TEXT,
      responsive_schema_json TEXT, data_bindings_json TEXT, preview_json TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO cms_definitions(id,account_id,definition_key,kind,label,origin,status)
      VALUES ('builtin-root','account-root','builtin-root','section','Built-in root','built_in','active');
  `);
  return db;
}

test('CMS app resolves every theme-scenes renderer through its canonical section renderer registry', () => {
  const catalog = ThemeScenesSections.catalog();
  assert.equal(catalog.length, 10);
  for (const item of catalog) {
    const renderer = getCmsSectionRenderer(item.rendererKey);
    assert.strictEqual(renderer, ThemeScenesSections);
    const content = renderer.defaults(item.rendererKey);
    assert.equal(renderer.validate(item.rendererKey, content).ok, true);
    assert.match(renderer.render({ key: 'scene-test', content }), /data-cms-section="scene-test"/);
  }
});

test('CMS scene pages and artifacts use existing scene page/artifact contracts', () => {
  const page = {
    id: 'creative-home', theme: 'inneranimal',
    sections: [{ id: 'hero', scene: 'hero.editorial', groups: [{ blocks: [{ kind: 'copy', title: 'Scene ready' }] }] }],
  };
  const composition = createCmsScenePage(page, { siteId: 'site-a' });
  assert.equal(composition.page.pageType, 'scene');
  assert.equal(composition.sections[0].rendererKey, 'theme-scenes/hero-editorial');
  assert.equal(readCmsScenePage(composition).ok, true);
  const artifact = createCmsSceneArtifactManifest({ artifactKey: 'creative/hero', page });
  assert.equal(artifact.artifact_type, 'scene');
  assert.equal(artifact.content_mode, 'scene');
  assert.equal(validateCmsSceneArtifactManifest(artifact).ok, true);
});

test('CMS migration registers ten site-independent, verified scene sections', () => {
  const db = migrationDb();
  try {
    db.exec(migration);
    const templates = db.prepare("SELECT sku, item_type, definition_key, json_extract(template_data, '$.rendererKey') AS renderer_key FROM cms_component_templates ORDER BY sort_order").all();
    const components = db.prepare("SELECT renderer_key, implementation_status FROM cms_components ORDER BY renderer_key").all();
    assert.equal(templates.length, 10);
    assert.equal(components.length, 10);
    assert.ok(templates.every((row) => row.item_type === 'section' && row.renderer_key.startsWith('theme-scenes/')));
    assert.ok(components.every((row) => row.implementation_status === 'verified'));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cms_component_templates WHERE featured_collection='Creative Scenes'").get().count, 10);
  } finally {
    db.close();
  }
});
