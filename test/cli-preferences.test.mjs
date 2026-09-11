import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CLI_PREFERENCES_SCHEMA, detectCliProject, readCliPreferences, writeCliPreferences } from '../src/lib/cli-preferences.js';
import { renderBootSummary } from '../src/ui/boot.js';

test('CLI preferences are project-local and explicitly non-authoritative for routing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cli-prefs-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo-project' }));
  const written = writeCliPreferences(root, { runtime: 'sandbox', terminal: 'zsh', modelPreference: 'ollama:qwen2.5-coder' });
  assert.equal(written.schemaVersion, CLI_PREFERENCES_SCHEMA);
  assert.equal(written.modelAuthority, 'preference-only');
  assert.deepEqual(readCliPreferences(root), written);

  const identity = detectCliProject(root);
  assert.equal(identity.project, 'demo-project');
  assert.equal(identity.root, root);

  const summary = renderBootSummary({ identity, preferences: written });
  assert.match(summary, /Agent Sam/);
  assert.match(summary, /demo-project/);
  assert.match(summary, /qwen2\.5-coder/);
});
