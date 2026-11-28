import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkill, listSkills, loadSkill, resolveSkillFilePath } from '../src/skills/index.js';

test('portable skill registry exposes AgentSam Jr Dev by id and alias', () => {
  const listed = listSkills();
  assert.ok(listed.some((skill) => skill.id === 'agentsam-jr-dev'));

  assert.equal(getSkill('agentsam_jr_dev')?.id, 'agentsam-jr-dev');
  assert.equal(getSkill('jr-dev')?.id, 'agentsam-jr-dev');
});

test('AgentSam Jr Dev loads compact instructions and references on demand', () => {
  const compact = loadSkill('agentsam-jr-dev');
  assert.match(compact.instructions, /# AgentSam Jr Dev/);
  assert.equal('references' in compact, false);

  const full = loadSkill('agentsam_jr_dev', { references: true });
  assert.equal(full.references.length, 2);
  assert.match(full.references[0].content, /## HTTP/);
  assert.match(full.references[1].content, /# Real Application Logic/);
});

test('experience workflow is discoverable without assigning brand authority', () => {
  assert.equal(getSkill('experience-atlas')?.id, 'agentsam-experience-delivery');
  const skill = loadSkill('agentsam-experience-delivery');
  assert.match(skill.instructions, /Machinery-first preflight/);
  assert.match(skill.instructions, /preserve|Preserve/);
  const withRefs = loadSkill('agentsam-experience-delivery', { references: true });
  assert.equal(withRefs.references.length, 1);
  assert.match(withRefs.references[0].content, /Mandatory interpretation mode/);
  assert.match(withRefs.references[0].content, /One source, many projections/);
});

test('every catalog skill resolves to real files and a matching frontmatter name', () => {
  const root = fileURLToPath(new URL('../skills/', import.meta.url));
  for (const skill of listSkills()) {
    const entry = resolveSkillFilePath(skill);
    assert.ok(fs.existsSync(entry), `${skill.id}: missing ${skill.entry}`);
    const name = /^name:\s*(.+)$/m.exec(fs.readFileSync(entry, 'utf8'))?.[1]?.trim();
    const manifestPath = path.join(path.dirname(entry), 'agentsam.skill.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (skill.id.startsWith('primetech-')) {
      assert.equal(name, manifest.name, skill.id + ': package skill frontmatter must match its AgentSam skill manifest');
    } else {
      assert.equal(name, skill.id, skill.id + ': SDK builtin frontmatter name must equal id');
    }
    for (const ref of skill.references ?? []) {
      assert.ok(fs.existsSync(path.resolve(root, ref)), `${skill.id}: missing reference ${ref}`);
    }
  }
});


test('PrimeTech package skills are all built into the SDK CLI at the matching package version', () => {
  const sdkRoot = fileURLToPath(new URL('../', import.meta.url));
  const packageJson = JSON.parse(fs.readFileSync(`${sdkRoot}packages/primetech-procedures/package.json`, 'utf8'));
  const agentPackage = JSON.parse(fs.readFileSync(`${sdkRoot}packages/primetech-procedures/agentsam.package.json`, 'utf8'));
  const primeTech = listSkills().filter((skill) => skill.package_name === '@inneranimalmedia/primetech-procedures');

  assert.equal(primeTech.length, 9);
  assert.equal(agentPackage.version, packageJson.version);
  for (const skill of primeTech) {
    assert.equal(skill.package_version, packageJson.version, `${skill.id}: stale SDK catalog package version`);
    const loaded = loadSkill(skill.id);
    assert.ok(loaded.instructions.length > 0, `${skill.id}: instructions must be available to the CLI`);
  }
});


test('SDK consumes PrimeTech skills from the npm dependency without bundling a duplicate workspace copy', () => {
  const sdkRoot = fileURLToPath(new URL('../', import.meta.url));
  const sdkPackage = JSON.parse(fs.readFileSync(`${sdkRoot}package.json`, 'utf8'));
  const primeTechPackage = JSON.parse(fs.readFileSync(`${sdkRoot}packages/primetech-procedures/package.json`, 'utf8'));
  const primeTech = listSkills().filter((skill) => skill.package_name === '@inneranimalmedia/primetech-procedures');

  assert.equal(sdkPackage.dependencies['@inneranimalmedia/primetech-procedures'], primeTechPackage.version);
  assert.equal(sdkPackage.files.some((entry) => entry.startsWith('packages/primetech-procedures')), false);
  assert.ok(primeTech.every((skill) => skill.entry === `${skill.id}/SKILL.md`));
  assert.ok(primeTech.every((skill) => skill.package_root === '@inneranimalmedia/primetech-procedures'));
});
