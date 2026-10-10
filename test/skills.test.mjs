import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSkill, listSkills, loadSkill } from '../src/skills/index.js';

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

test('every catalog skill resolves to real files and a matching frontmatter name', () => {
  const root = fileURLToPath(new URL('../skills/', import.meta.url));
  for (const skill of listSkills()) {
    const entry = `${root}${skill.entry}`;
    assert.ok(fs.existsSync(entry), `${skill.id}: missing ${skill.entry}`);
    const name = /^name:\s*(\S+)/m.exec(fs.readFileSync(entry, 'utf8'))?.[1];
    assert.equal(name, skill.id, `${skill.id}: frontmatter name must equal id`);
    for (const ref of skill.references ?? []) {
      assert.ok(fs.existsSync(`${root}${ref}`), `${skill.id}: missing reference ${ref}`);
    }
  }
});
