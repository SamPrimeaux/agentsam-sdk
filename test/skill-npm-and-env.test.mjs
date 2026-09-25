import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolveNpmSkillPackage } from '../src/commands/skill.js';
import { installSkillFromPath } from '../src/skills/index.js';
import { runEnv } from '../src/commands/env.js';

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-finish-'));
}

test('resolveNpmSkillPackage extracts agentsam.skill.json via npm pack', (t) => {
  // Build a tiny local package and pack it by path (no registry).
  const pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-npm-skill-'));
  fs.writeFileSync(
    path.join(pkgRoot, 'package.json'),
    JSON.stringify({ name: 'tmp-agentsam-skill-fixture', version: '0.0.0', private: true }),
  );
  fs.writeFileSync(
    path.join(pkgRoot, 'agentsam.skill.json'),
    JSON.stringify({
      schema: 'agentsam.skill.v1',
      id: 'npm-fixture',
      name: 'NPM Fixture',
      slash: { suggested: '/npm-fixture' },
      instructions: { source: 'inline', inline: '# npm fixture' },
      execution: { mode: 'turn' },
    }),
  );
  const resolved = resolveNpmSkillPackage(pkgRoot, { spawnSyncImpl: spawnSync });
  assert.ok(fs.existsSync(path.join(resolved, 'agentsam.skill.json')));

  const home = tmpHome();
  const installed = installSkillFromPath(resolved, { home });
  assert.equal(installed.id, 'npm-fixture');
  assert.equal(installed.trigger, '/npm-fixture');
});

test('env boot-line prints source load-agent-env command', async () => {
  const home = tmpHome();
  const lines = [];
  const result = await runEnv(['boot-line', 'cursor', 'inneranimalmedia'], {
    home,
    write: (t) => lines.push(t),
  });
  assert.match(result.command, /source ~\/\.agentsam\/load-agent-env\.sh cursor inneranimalmedia/);
  assert.ok(lines.join('').includes('load-agent-env.sh'));
});
