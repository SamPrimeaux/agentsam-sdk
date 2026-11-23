import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkill } from '../../src/skills/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillsRoot = path.join(root, 'skills');

test('AgentSam CAD skill loads every progressive-disclosure reference', () => {
  const loaded = loadSkill('agentsam-cad', { references: true });
  assert.ok(loaded.instructions.includes('cad.project.v2'));
  assert.ok(loaded.instructions.includes('agentsam cad project'));
  assert.ok(loaded.instructions.includes('legacy v1 runtime'));
  assert.ok(loaded.instructions.includes('CadServiceClient'));
  assert.ok(loaded.instructions.includes('CadJobClient'));
  assert.ok(loaded.instructions.includes('assets.inventory()'));
  assert.ok(loaded.instructions.includes('format'));
  assert.ok(loaded.references.length >= 5);
  for (const reference of loaded.references) {
    assert.ok(reference.content.trim(), `empty skill reference: ${reference.path}`);
  }
});

test('AgentSam CAD trigger metadata covers the actual CAD and BIM vocabulary', () => {
  const entry = JSON.parse(fs.readFileSync(path.join(skillsRoot, 'catalog.json'), 'utf8'))
    .skills.find((skill) => skill.id === 'agentsam-cad');
  const manifest = JSON.parse(fs.readFileSync(
    path.join(skillsRoot, 'agentsam-cad/agentsam.skill.json'), 'utf8'));
  const skill = fs.readFileSync(path.join(skillsRoot, 'agentsam-cad/SKILL.md'), 'utf8').toLowerCase();
  const triggerText = `${entry.description} ${entry.aliases.join(' ')} ${manifest.description} ${skill}`.toLowerCase();
  for (const term of ['freecad', 'openscad', 'occt', 'ifc', 'iamscene', 'iamgeometry', '.step', '.stl', '.mov']) {
    assert.ok(triggerText.includes(term), `missing CAD skill trigger: ${term}`);
  }
  assert.ok(entry.references.includes('agentsam-cad/references/python-service-and-jobs.md'));
  assert.match(fs.readFileSync(path.join(skillsRoot, 'agentsam-cad/references/python-service-and-jobs.md'), 'utf8'), /repo\.asset\.inventory@0\.1\.0/);
});

test('five realistic CAD prompts have explicit safe routing expectations', () => {
  const cases = fs.readFileSync(
    path.join(skillsRoot, 'agentsam-cad/evals/README.md'), 'utf8');
  const prompts = cases.match(/^## \d+\./gm) ?? [];
  assert.equal(prompts.length, 5);
  assert.match(cases, /GlobalIds/);
  assert.match(cases, /download_to\(\)/);
  assert.match(cases, /parametric B-Rep reconstruction/);
  assert.match(cases, /local[\s\S]+still v1/);
});
