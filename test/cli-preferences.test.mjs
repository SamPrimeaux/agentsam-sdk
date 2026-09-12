import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CLI_PREFERENCES_SCHEMA, detectCliProject, readCliPreferences, writeCliPreferences } from '../src/lib/cli-preferences.js';
import { renderBootSummary } from '../src/ui/boot.js';

test('CLI preferences persist local model/runtime controls without becoming routing authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cli-prefs-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo-project' }));
  const written = writeCliPreferences(root, {
    trustedDirectory: true,
    runtime: 'sandbox',
    terminal: 'zsh',
    modelPreference: 'openai:gpt-6-astra',
    reasoningEffort: 'high',
    serviceTier: 'fast',
  });
  assert.equal(written.schemaVersion, CLI_PREFERENCES_SCHEMA);
  assert.equal(written.modelAuthority, 'preference-only');
  assert.equal(written.trustedDirectory, true);
  assert.deepEqual(readCliPreferences(root), written);
  const identity = detectCliProject(root);
  assert.equal(identity.project, 'demo-project');
  assert.equal(identity.root, root);
  const summary = renderBootSummary({ identity, preferences: written });
  assert.match(summary, /Agent Sam/);
  assert.match(summary, /demo-project/);
  assert.match(summary, /openai:gpt-6-astra/);
  assert.match(summary, /high/);
  assert.match(summary, /fast/);
});

test('legacy v1 local preferences migrate in memory without inventing trust', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cli-legacy-'));
  fs.mkdirSync(path.join(root, '.agentsam'));
  fs.writeFileSync(path.join(root, '.agentsam', 'cli.json'), JSON.stringify({
    schemaVersion: 'agentsam-cli-preferences-v1', runtime: 'local', terminal: 'zsh', modelPreference: 'auto', modelAuthority: 'preference-only',
  }));
  const read = readCliPreferences(root);
  assert.equal(read.schemaVersion, CLI_PREFERENCES_SCHEMA);
  assert.equal(read.trustedDirectory, false);
  assert.equal(read.reasoningEffort, 'auto');
  assert.equal(read.serviceTier, 'default');
});
