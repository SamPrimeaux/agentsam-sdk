import test from 'node:test';
import assert from 'node:assert/strict';

import { getCliCommand } from '../../src/cli/command-catalog.js';
import {
  listCheatSheetGroups,
  renderCheatSheet,
  runCheatSheet,
} from '../../src/commands/cheat-sheet.js';

test('cheat-sheet top-level commands resolve through the canonical CLI catalog', () => {
  const seen = new Set();
  for (const group of listCheatSheetGroups()) {
    for (const command of group.commands) {
      for (const invocation of command.invocations) {
        assert.match(invocation, /^agentsam\s+\S+/);
        const root = invocation.split(/\s+/)[1];
        assert.ok(getCliCommand(root), `unregistered cheat-sheet command: ${invocation}`);
        seen.add(root);
      }
    }
  }
  for (const required of ['capabilities', 'setup', 'runtime', 'app', 'plan', 'machine', 'brand', 'db', 'plugins']) {
    assert.ok(seen.has(required), `missing production surface: ${required}`);
  }
});

test('cheat-sheet distinguishes install recipes, runtime, declarations, and app distribution hints', () => {
  const displayed = renderCheatSheet('2.6.12');
  assert.match(displayed, /agentsam setup runtime --dry-run/);
  assert.match(displayed, /agentsam capabilities --inventory --json/);
  assert.match(displayed, /agentsam app install <id>\s+Print distribution instructions; not a runtime install/);
  assert.doesNotMatch(displayed, /agentsam project\s/);
  assert.doesNotMatch(displayed, /agentsam artifacts\s/);
  let json = '';
  const code = runCheatSheet(['--json'], { version: '2.6.12', write: text => { json += text; } });
  assert.equal(code, 0);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schema_version, 'agentsam-cheat-sheet-v1');
  assert.ok(parsed.groups.find(group => group.id === 'capabilities'));
});
