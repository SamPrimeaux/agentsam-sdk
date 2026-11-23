import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSkillManifest } from '../../src/skills/manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillsRoot = path.join(root, 'skills');
const catalog = JSON.parse(fs.readFileSync(path.join(skillsRoot, 'catalog.json'), 'utf8'));

test('every SDK skill in the catalog has a validating adjacent manifest and instructions', () => {
  const directoryIds = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()
      && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name).sort();
  const catalogIds = catalog.skills.map((entry) => entry.id).sort();
  assert.deepEqual(catalogIds, directoryIds, 'catalog and bundled SKILL.md directories must match');

  const triggers = new Set();
  for (const entry of catalog.skills) {
    const file = path.join(skillsRoot, entry.id, 'agentsam.skill.json');
    assert.ok(fs.existsSync(file), `missing skill manifest: ${entry.id}`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(raw.schema, 'agentsam.skill.v1');
    const manifest = normalizeSkillManifest(raw);
    assert.equal(manifest.id, entry.id, `skill manifest identity mismatch for ${entry.id}`);
    assert.equal(manifest.instructions.source, 'local_file');
    assert.equal(manifest.instructions.ref, 'SKILL.md');
    assert.ok(fs.readFileSync(path.join(skillsRoot, entry.id, manifest.instructions.ref), 'utf8').trim());
    assert.ok(manifest.name.length > 0 && manifest.description.length > 0);
    if (manifest.slash?.suggested) {
      assert.ok(!triggers.has(manifest.slash.suggested), `duplicate slash: ${manifest.slash.suggested}`);
      triggers.add(manifest.slash.suggested);
    }
  }
});

test('source manifests alone do not authorize production publication or DB installation', () => {
  for (const entry of catalog.skills) {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(skillsRoot, entry.id, 'agentsam.skill.json'), 'utf8'));
    assert.notEqual(manifest.is_published, true, `source-only manifest prematurely published: ${entry.id}`);
  }
});
