import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

test('npm tarball includes AgentSam and OpenAI manifests, skills, and TypeScript declarations', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const [packed] = JSON.parse(result.stdout);
  const files = new Set(packed.files.map(file => file.path));
  for (const required of [
    'agentsam.package.json',
    'plugin.json',
    'agents/openai.yaml',
    '.codex-plugin/plugin.json',
    'assets/architect-icon.svg',
    'assets/primetech-design-studio.svg',
    'companion.json',
    'plugin.README.md',
    'scripts/package-openai-plugin.py',
    'src/index.d.ts',
    'src/skills.d.ts',
    'src/production-board.d.ts',
    'src/creative/index.d.ts',
    'skills/primetech-brand-kit/SKILL.md',
    'skills/primetech-iconography/SKILL.md',
  ]) assert.ok(files.has(required), `missing from npm tarball: ${required}`);
  assert.equal(files.has('test/typescript-consumer.mts'), false, 'test fixture must not ship');

  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'agentsam.package.json'), 'utf8'));
  assert.equal(manifest.name, packed.name);
  const plugin = JSON.parse(fs.readFileSync(path.join(packageRoot, 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'architect-design-studio');
  assert.equal(plugin.version, '0.3.0');
  const codexPlugin = JSON.parse(fs.readFileSync(path.join(packageRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(codexPlugin.name, plugin.name);
  assert.equal(codexPlugin.version, plugin.version);
  const companion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'companion.json'), 'utf8'));
  assert.equal(companion.plugin.version, plugin.version);
  const ui = plugin.extensions['com.openai'].interface;
  assert.equal(ui.category, 'Creativity');
  assert.ok(ui.shortDescription.length <= 30, 'OpenAI listing subtitle exceeds 30 characters');
  assert.equal(ui.displayName, 'PrimeTech Design Studio');
  const skillDirs = fs.readdirSync(path.join(packageRoot, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(packageRoot, 'skills', entry.name, 'SKILL.md')));
  assert.equal(skillDirs.length, 9, 'expected nine canonical skills');
  for (const skillDir of skillDirs) {
    assert.ok(files.has(`skills/${skillDir.name}/SKILL.md`), `missing skill from npm tarball: ${skillDir.name}`);
  }
});


test('OpenAI plugin archive contains the nine canonical skills without AgentSam-only manifests or a fake MCP endpoint', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-plugin-'));
  const archivePath = path.join(tempDir, 'architect-design-studio-0.3.0.zip');
  try {
    const build = spawnSync('python3', [
      path.join(packageRoot, 'scripts', 'package-openai-plugin.py'), '--output', archivePath,
    ], { cwd: packageRoot, encoding: 'utf8' });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const summary = JSON.parse(build.stdout);
    assert.equal(summary.plugin, 'architect-design-studio');
    assert.equal(summary.display_name, 'PrimeTech Design Studio');
    assert.equal(summary.version, '0.3.0');
    assert.equal(summary.skills, 9);
    assert.equal(summary.uploaded, false);

    const listing = spawnSync('python3', ['-c',
      'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps(z.namelist()))', archivePath,
    ], { encoding: 'utf8' });
    assert.equal(listing.status, 0, `${listing.stdout}\n${listing.stderr}`);
    const paths = new Set(JSON.parse(listing.stdout));
    for (const required of [
      'architect-design-studio/plugin.json',
      'architect-design-studio/.codex-plugin/plugin.json',
      'architect-design-studio/agents/openai.yaml',
      'architect-design-studio/README.md',
      'architect-design-studio/assets/primetech-design-studio.svg',
      'architect-design-studio/companion.json',
      'architect-design-studio/skills/primetech-brand-kit/SKILL.md',
      'architect-design-studio/skills/primetech-visual-qa/SKILL.md',
    ]) assert.ok(paths.has(required), `missing from OpenAI plugin archive: ${required}`);
    assert.equal([...paths].filter(name => /\/skills\/[^/]+\/SKILL\.md$/.test(name)).length, 9);
    assert.equal([...paths].some(name => name.endsWith('agentsam.skill.json')), false);
    assert.equal([...paths].some(name => name.endsWith('/mcp.json')), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
