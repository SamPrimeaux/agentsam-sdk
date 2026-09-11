import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getSkill, listSkills, loadSkill } from '../src/skills/index.js';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'src', 'cli.js');

test('application fundamentals and progression guard are portable registered skills', () => {
  const ids = new Set(listSkills().map((skill) => skill.id));
  assert.ok(ids.has('agentsam-app-fundamentals'));
  assert.ok(ids.has('agentsam-progression-guard'));
  assert.equal(getSkill('quick-bytes')?.id, 'agentsam-app-fundamentals');
  assert.equal(getSkill('no-regress')?.id, 'agentsam-progression-guard');

  const fundamentals = loadSkill('quick-bytes', { references: true });
  assert.equal(fundamentals.references.length, 2);
  assert.match(fundamentals.instructions, /Credentialed-destination card/);
  assert.match(fundamentals.instructions, /AST/);
  assert.match(fundamentals.instructions, /Merkle/);
  assert.match(fundamentals.instructions, /Firewall\/WAF/);
  assert.match(fundamentals.references[0].content, /OAuth redirect mental model/);
  assert.match(fundamentals.references[1].content, /The codebase is a graph/);

  const guard = loadSkill('no-regress', { references: true });
  assert.equal(guard.references.length, 2);
  assert.match(guard.instructions, /failed candidate must not advance the last-known-good baseline/);
  assert.match(guard.instructions, /agentsam deploy-receipt capture/);
  assert.match(guard.references[0].content, /Gate 6 — postdeploy/);
  assert.match(guard.references[1].content, /Ingress versus egress hooks/);
});

test('skills CLI lists compact cards and loads quick reminders by alias', () => {
  const listed = spawnSync(process.execPath, [cli, 'skills', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const catalog = JSON.parse(listed.stdout);
  assert.ok(catalog.some((skill) => skill.id === 'agentsam-app-fundamentals'));
  assert.ok(catalog.some((skill) => skill.id === 'agentsam-progression-guard'));

  const loaded = spawnSync(process.execPath, [cli, 'skills', 'quick-bytes'], { cwd: root, encoding: 'utf8' });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /# AgentSam Application Fundamentals/);
  assert.doesNotMatch(loaded.stdout, /# Trust, Credentials, and Credentialed Destinations/);

  const full = spawnSync(process.execPath, [cli, 'skills', 'no-regress', '--references'], { cwd: root, encoding: 'utf8' });
  assert.equal(full.status, 0, full.stderr);
  assert.match(full.stdout, /# AgentSam Progression Guard/);
  assert.match(full.stdout, /# Checkpoint Chain/);
  assert.match(full.stdout, /# Hooks and Operational I\/O/);
});

test('portable npm package still owns all skill files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('skills'));
  for (const rel of [
    'skills/agentsam-app-fundamentals/SKILL.md',
    'skills/agentsam-progression-guard/SKILL.md',
  ]) assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} must exist`);
});
