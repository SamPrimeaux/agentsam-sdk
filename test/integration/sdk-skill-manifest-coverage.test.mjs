import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { normalizeSkillManifest } from '../../src/skills/manifest.js';
import { SkillRegistry } from '../../src/skills/registry.js';
import { getSkill, listSkills } from '../../src/skills/catalog.js';

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


test('npm package skill selection is explicit; source-only playbooks remain unpromoted', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packed = new Set(pkg.files.filter((p) => p.startsWith('skills/agentsam-'))
    .map((p) => p.slice('skills/'.length)));
  assert.ok(packed.size > 0 && packed.size <= catalog.skills.length);
  const sourceIds = new Set(catalog.skills.map((s) => s.id));
  for (const id of packed) assert.ok(sourceIds.has(id), `packaged unknown skill: ${id}`);
  assert.ok(packed.size < sourceIds.size, 'unreviewed SDK skills should not be included in npm by this PR');
  assert.equal(listSkills().length, catalog.skills.length, 'the development repo contains all skill sources');
  assert.ok(getSkill('agentsam-cad'));
});

test('builtin skill registry only advertises physically available instructions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-builtin-skill-root-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-builtin-home-'));
  try {
    const id = 'agentsam-jr-dev';
    const dir = path.join(tmp, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(skillsRoot, id, 'SKILL.md'), path.join(dir, 'SKILL.md'));
    fs.copyFileSync(path.join(skillsRoot, id, 'agentsam.skill.json'),
      path.join(dir, 'agentsam.skill.json'));
    const registry = new SkillRegistry({ skillsRoot: tmp, home });
    const builtins = registry.list().filter((skill) => skill.source === 'builtin');
    assert.deepEqual(builtins.map((skill) => skill.id), [id]);
    assert.equal(builtins[0].manifest.instructions.source, 'package_file');
    assert.equal(builtins[0].manifest.instructions.ref, id + '/SKILL.md');
    assert.equal(registry.getById('agentsam-game-threejs'), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
