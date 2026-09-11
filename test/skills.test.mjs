import assert from 'node:assert/strict';
import test from 'node:test';
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
