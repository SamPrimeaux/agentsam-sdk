import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { normalizeSkillManifest } from '../../src/skills/manifest.js';
import { SkillRegistry } from '../../src/skills/registry.js';
import { SkillContentResolver } from '../../src/skills/content-resolver.js';
import { getSkill, listSkills, resolveSkillFilePath } from '../../src/skills/catalog.js';
import { resolveNpmPackageRoot } from '../../src/skills/package-source.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillsRoot = path.join(root, 'skills');
const catalog = JSON.parse(fs.readFileSync(path.join(skillsRoot, 'catalog.json'), 'utf8'));

function sourcePaths(entry) {
  const markdown = entry.package_root
    ? resolveSkillFilePath(entry)
    : path.resolve(skillsRoot, entry.entry);
  return { markdown, directory: path.dirname(markdown), manifest: path.join(path.dirname(markdown), 'agentsam.skill.json') };
}

test('every SDK catalog skill has a validating adjacent manifest and instructions', () => {
  const directoryIds = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()
      && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name).sort();
  const catalogSdkIds = catalog.skills.filter((entry) => !entry.package_root)
    .map((entry) => entry.id).sort();
  assert.deepEqual(catalogSdkIds, directoryIds, 'top-level SDK catalog and bundled SKILL.md directories must match');

  const triggers = new Set();
  for (const entry of catalog.skills) {
    const files = sourcePaths(entry);
    assert.ok(fs.existsSync(files.manifest), 'missing skill manifest: ' + entry.id);
    assert.ok(fs.existsSync(files.markdown), 'missing skill instructions: ' + entry.id);
    const raw = JSON.parse(fs.readFileSync(files.manifest, 'utf8'));
    assert.equal(raw.schema, 'agentsam.skill.v1');
    const manifest = normalizeSkillManifest(raw);
    assert.equal(manifest.id, entry.id, 'skill manifest identity mismatch for ' + entry.id);
    assert.equal(manifest.instructions.source, 'local_file');
    assert.equal(manifest.instructions.ref, 'SKILL.md');
    assert.ok(fs.readFileSync(files.markdown, 'utf8').trim());
    assert.ok(manifest.name.length > 0 && manifest.description.length > 0);
    if (entry.package_root) {
      assert.equal(manifest.package, entry.package_name);
      const packageRoot = resolveNpmPackageRoot(entry.package_root);
      const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      assert.equal(packageManifest.version, entry.package_version);
    }
    if (manifest.slash?.suggested) {
      assert.ok(!triggers.has(manifest.slash.suggested), 'duplicate slash: ' + manifest.slash.suggested);
      triggers.add(manifest.slash.suggested);
    }
  }
});

test('source manifests alone do not authorize production publication or DB installation', () => {
  for (const entry of catalog.skills) {
    const files = sourcePaths(entry);
    const manifest = JSON.parse(fs.readFileSync(files.manifest, 'utf8'));
    assert.notEqual(manifest.is_published, true, 'source-only manifest prematurely published: ' + entry.id);
  }
});

test('npm package skill selection is explicit and package-owned skills have an included source path', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packedSdk = new Set(pkg.files.filter((p) => p.startsWith('skills/agentsam-'))
    .map((p) => p.slice('skills/'.length)));
  assert.ok(packedSdk.size > 0 && packedSdk.size <= catalog.skills.filter(s => !s.package_root).length);
  const sourceIds = new Set(catalog.skills.map((s) => s.id));
  for (const id of packedSdk) assert.ok(sourceIds.has(id), 'packaged unknown skill: ' + id);
  assert.ok(packedSdk.size < sourceIds.size, 'unreviewed SDK skills should not be included by this release');

  const rootFiles = new Set(pkg.files);
  for (const entry of catalog.skills.filter((row) => row.package_root)) {
    const packageRoot = resolveNpmPackageRoot(entry.package_root);
    const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const relativeDir = path.posix.join('skills', path.posix.dirname(entry.entry));
    const packageIncludesSkill = packageManifest.files.some((file) => {
      const prefix = String(file).replace(/\/$/, '');
      return relativeDir === prefix || relativeDir.startsWith(prefix + '/') || prefix.startsWith(relativeDir + '/');
    });
    assert.ok(packageIncludesSkill, 'package files allowlist omits ' + entry.id);
    assert.equal(pkg.dependencies[entry.package_name], entry.package_version,
      'root SDK must install the canonical npm package at the catalogued version');
    assert.equal([...rootFiles].some((file) => file.startsWith('packages/primetech-procedures/')), false,
      'root SDK must not vendor a duplicate copy of the PrimeTech package');
  }

  assert.equal(listSkills().length, catalog.skills.length, 'the development SDK must expose all catalog skills');
  assert.ok(getSkill('agentsam-cad'));
  assert.ok(getSkill('primetech-brand-kit'));
});

test('builtin skill registry only advertises physically available instructions in a custom root', () => {
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
    assert.equal(builtins[0].manifest.id, id);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});


test('package-owned PrimeTech skills are discoverable and readable through the builtin skill runtime', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-primetech-skill-home-'));
  try {
    const registry = new SkillRegistry({ home });
    const skill = registry.list().find((entry) => entry.id === 'primetech-brand-kit');
    assert.ok(skill, 'PrimeTech brand kit should be in the builtin skill registry');
    assert.equal(skill.package, '@inneranimalmedia/primetech-procedures');
    assert.equal(skill.trigger, '/primetech-brand-kit');
    const resolver = new SkillContentResolver();
    const resolved = await resolver.resolve(skill.manifest, {
      baseDir: skill.baseDir,
      packageRoot: skill.baseDir,
    });
    assert.equal(resolved.source, 'package_file');
    assert.ok(resolved.content.includes('## Trigger conditions'));
    assert.ok(resolved.content.includes('## Quality gates'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
