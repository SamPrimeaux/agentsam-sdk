import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const skill = path.join(root, 'skills', 'agentsam-jr-dev', 'SKILL.md');
const fundamentals = path.join(root, 'skills', 'agentsam-jr-dev', 'references', 'web-application-fundamentals.md');
const logic = path.join(root, 'skills', 'agentsam-jr-dev', 'references', 'real-application-logic.md');

test('agentsam-jr-dev ships as a portable skill with depth references', () => {
  for (const file of [skill, fundamentals, logic]) {
    assert.equal(fs.existsSync(file), true, `${file} must exist`);
  }

  const text = fs.readFileSync(skill, 'utf8');
  assert.match(text, /name: agentsam-jr-dev/);
  assert.match(text, /Inspect before teaching repo-specific facts/);
  assert.match(text, /Real application logic is the standard/);
  assert.match(text, /Never invent a repo architecture/);
  assert.match(text, /frontend owns presentation/);
  assert.match(text, /backend owns trusted execution/);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('skills'), 'root npm package must include portable skills');
});
