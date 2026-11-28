import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolveNpmSkillPackage, runSkill } from '../../src/commands/skill.js';
import { installSkillFromPath, readLocalRegistry } from '../../src/skills/index.js';
import { runEnv } from '../../src/commands/env.js';

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


test('resolveNpmSkillPackage retries once when npm reports success without materializing a tarball', () => {
  const pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-npm-skill-retry-'));
  fs.writeFileSync(
    path.join(pkgRoot, 'package.json'),
    JSON.stringify({ name: 'tmp-agentsam-skill-retry', version: '0.0.0', private: true }),
  );
  fs.writeFileSync(
    path.join(pkgRoot, 'agentsam.skill.json'),
    JSON.stringify({
      schema: 'agentsam.skill.v1',
      id: 'npm-retry-fixture',
      name: 'NPM Retry Fixture',
      instructions: { source: 'inline', inline: '# npm retry fixture' },
      execution: { mode: 'turn' },
    }),
  );

  let packAttempts = 0;

  const flakySpawn = (command, args, options) => {
    if (command === 'npm' && args?.[0] === 'pack') {
      packAttempts += 1;

      if (packAttempts === 1) {
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              filename: 'tmp-agentsam-skill-retry-0.0.0.tgz',
            },
          ]),
          stderr: '',
        };
      }
    }

    return spawnSync(command, args, options);
  };

  const resolved = resolveNpmSkillPackage(pkgRoot, {
    spawnSyncImpl: flakySpawn,
  });

  assert.equal(packAttempts, 2);
  assert.ok(fs.existsSync(path.join(resolved, 'agentsam.skill.json')));
});


test('resolveNpmSkillPackage ignores inherited npm dry-run lifecycle state', () => {
  const pkgRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agentsam-npm-skill-dry-run-'),
  );

  fs.writeFileSync(
    path.join(pkgRoot, 'package.json'),
    JSON.stringify({
      name: 'tmp-agentsam-skill-dry-run',
      version: '0.0.0',
      private: true,
    }),
  );

  fs.writeFileSync(
    path.join(pkgRoot, 'agentsam.skill.json'),
    JSON.stringify({
      schema: 'agentsam.skill.v1',
      id: 'npm-dry-run-fixture',
      name: 'NPM Dry Run Fixture',
      instructions: {
        source: 'inline',
        inline: '# npm dry-run fixture',
      },
      execution: {
        mode: 'turn',
      },
    }),
  );

  const resolved = resolveNpmSkillPackage(pkgRoot, {
    env: {
      ...process.env,
      npm_config_dry_run: 'true',
    },
  });

  assert.ok(
    fs.existsSync(path.join(resolved, 'agentsam.skill.json')),
  );
});

test('env boot-line prints source load-agent-env command', async () => {
  const home = tmpHome();
  const lines = [];
  const result = await runEnv(['boot-line', 'cursor', 'inneranimalmedia'], {
    home,
    write: (t) => lines.push(t),
  });
  assert.equal(result.command, 'source ~/.agentsam/load-agent-env.sh');
  assert.ok(lines.join('').includes('load-agent-env.sh'));
  assert.ok(lines.join('').includes('agentsam env shell'));
});


test('npm package collections install every nested AgentSam skill through the CLI', async () => {
  const pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-npm-skill-collection-'));
  fs.writeFileSync(
    path.join(pkgRoot, 'package.json'),
    JSON.stringify({
      name: 'tmp-agentsam-skill-collection',
      version: '0.0.0',
      files: ['skills/'],
    }),
  );

  for (const id of ['collection-alpha', 'collection-beta']) {
    const skillRoot = path.join(pkgRoot, 'skills', id);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${id}\n\nReusable fixture instructions.\n`);
    fs.writeFileSync(
      path.join(skillRoot, 'agentsam.skill.json'),
      JSON.stringify({
        schema: 'agentsam.skill.v1',
        id,
        name: id,
        description: `${id} test skill`,
        slash: { suggested: `/${id}` },
        instructions: { source: 'local_file', ref: 'SKILL.md' },
        execution: { mode: 'turn', tools: [], operations: [], capabilities: [] },
      }),
    );
  }

  const packageRoot = resolveNpmSkillPackage(pkgRoot, { spawnSyncImpl: spawnSync });
  assert.ok(fs.existsSync(path.join(packageRoot, 'skills', 'collection-alpha', 'agentsam.skill.json')));
  assert.ok(fs.existsSync(path.join(packageRoot, 'skills', 'collection-beta', 'agentsam.skill.json')));

  const home = tmpHome();
  const output = [];
  const installed = await runSkill(['install', packageRoot], {
    home,
    write: (value) => output.push(value),
  });

  assert.equal(installed.length, 2);
  assert.deepEqual(installed.map((row) => row.id).sort(), ['collection-alpha', 'collection-beta']);
  const registry = readLocalRegistry({ home });
  assert.deepEqual(Object.keys(registry.entries).sort(), ['collection-alpha', 'collection-beta']);
  assert.equal(registry.triggers['/collection-alpha'], 'collection-alpha');
  assert.equal(registry.triggers['/collection-beta'], 'collection-beta');
  assert.match(output.join(''), /installed 2 skills/);
  for (const id of ['collection-alpha', 'collection-beta']) {
    const installedSkill = path.join(home, '.agentsam', 'skills', 'installed', id, 'SKILL.md');
    assert.match(fs.readFileSync(installedSkill, 'utf8'), new RegExp(id));
  }
});
