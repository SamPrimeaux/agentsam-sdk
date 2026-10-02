#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] || 'check';
const dryRun = args.includes('--dry-run');
const requestedVersion = args.slice(1).find((arg) => !arg.startsWith('--')) || null;
const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const candidateVersionJsonFiles = [
  'apps/local-studio/agentsam.app.json',
  'packages/agentsam-desktop-shell/manifests/local-studio.json',
  'packages/agentsam-desktop-shell/src-tauri/tauri.conf.json',
];

function walkPackageJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.output', '.git', '.wrangler'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPackageJson(full, out);
    else if (entry.name === 'package.json') out.push(full);
  }
  return out;
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const rootManifestPath = path.join(root, 'package.json');
const rootManifest = read(rootManifestPath);
const targetVersion = requestedVersion || rootManifest.version;
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(targetVersion || '')) {
  throw new Error(`invalid release train version: ${targetVersion || '<empty>'}`);
}

const files = [
  rootManifestPath,
  ...walkPackageJson(path.join(root, 'packages')),
  ...walkPackageJson(path.join(root, 'apps')),
];

const workspaces = files
  .map((file) => ({ file, manifest: read(file) }))
  .filter(({ manifest }) => manifest.name?.startsWith('@inneranimalmedia/'));
const workspaceNames = new Set(workspaces.map(({ manifest }) => manifest.name));

function relative(file) {
  return path.relative(root, file) || 'package.json';
}

function expectedDependencyVersion(spec) {
  // This monorepo intentionally uses an exact first-party release train. Keeping
  // one syntax also makes packed-consumer and registry verification deterministic.
  return targetVersion;
}

function releaseManifestDrift() {
  const file = path.join(root, 'agentsam.yaml');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const failures = [];
  const modeled = [
    '@inneranimalmedia/agentsam-sdk',
    '@inneranimalmedia/agentsam-identity',
    '@inneranimalmedia/agentsam-contracts',
    '@inneranimalmedia/agentsam-workbench',
    '@inneranimalmedia/agentsam-shell-kit',
  ];
  for (const name of modeled) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`name: "${escaped}"\\n\\s+version: "([^"]+)"`));
    if (!match) failures.push(`agentsam.yaml: missing modeled package ${name}`);
    else if (match[1] !== targetVersion) failures.push(`agentsam.yaml: ${name}=${match[1]} != ${targetVersion}`);
  }
  const target = text.match(/release:\s*[\s\S]*?root_sdk:\s*[\s\S]*?target_version: "([^"]+)"/);
  if (!target) failures.push('agentsam.yaml: missing release.root_sdk.target_version');
  else if (target[1] !== targetVersion) failures.push(`agentsam.yaml: release target=${target[1]} != ${targetVersion}`);
  return failures;
}

function check() {
  const failures = [];
  let dependencyEdges = 0;
  for (const { file, manifest } of workspaces) {
    if (manifest.version !== targetVersion) {
      failures.push(`${manifest.name}: version ${manifest.version || '<missing>'} != ${targetVersion} (${relative(file)})`);
    }
    for (const section of sections) {
      for (const [name, spec] of Object.entries(manifest[section] || {})) {
        if (!workspaceNames.has(name)) continue;
        dependencyEdges += 1;
        const expected = expectedDependencyVersion(spec);
        if (spec !== expected) {
          failures.push(`${manifest.name}: ${section}.${name}=${spec} != ${expected} (${relative(file)})`);
        }
      }
    }
  }

  for (const rel of candidateVersionJsonFiles) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { failures.push(`${rel}: missing candidate metadata`); continue; }
    const value = read(file)?.version;
    if (value !== targetVersion) failures.push(`${rel}: version ${value || '<missing>'} != ${targetVersion}`);
  }
  failures.push(...releaseManifestDrift());

  const publicCount = workspaces.filter(({ manifest }) => manifest.private !== true && manifest.publishConfig?.access === 'public').length;
  const privateCount = workspaces.filter(({ manifest }) => manifest.private === true).length;
  console.log(`AgentSam release train ${targetVersion}`);
  console.log(`  workspaces ${workspaces.length} · public ${publicCount} · private ${privateCount} · internal edges ${dependencyEdges}`);
  if (failures.length) {
    console.error(`  FAIL ${failures.length} release-train drift(s)`);
    for (const failure of failures) console.error(`    - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('  PASS all first-party workspace versions and dependency pins aligned');
}

function align() {
  let changedFiles = 0;
  let changedVersions = 0;
  let changedEdges = 0;
  for (const { file, manifest } of workspaces) {
    let changed = false;
    if (manifest.version !== targetVersion) {
      manifest.version = targetVersion;
      changedVersions += 1;
      changed = true;
    }
    for (const section of sections) {
      if (!manifest[section]) continue;
      for (const [name, spec] of Object.entries(manifest[section])) {
        if (!workspaceNames.has(name)) continue;
        const expected = expectedDependencyVersion(spec);
        if (spec !== expected) {
          manifest[section][name] = expected;
          changedEdges += 1;
          changed = true;
        }
      }
    }
    if (changed) {
      changedFiles += 1;
      if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} ${manifest.name}@${targetVersion} · ${relative(file)}`);
    }
  }
  for (const rel of candidateVersionJsonFiles) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const manifest = read(file);
    if (manifest.version === targetVersion) continue;
    manifest.version = targetVersion;
    changedFiles += 1;
    changedVersions += 1;
    if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} candidate metadata ${rel}@${targetVersion}`);
  }
  console.log(`${dryRun ? 'DRY RUN' : 'DONE'} files=${changedFiles} versions=${changedVersions} dependency_pins=${changedEdges}`);
}

if (mode === 'check') check();
else if (mode === 'align') align();
else {
  console.error('Usage: node scripts/release-train.mjs check [version] | align [version] [--dry-run]');
  process.exitCode = 2;
}
