#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPrivateWorkspaceDependencyEdges } from './release-train-policy.mjs';
import { expectedSdkTarballVersion } from '../apps/local-studio/scripts/sdk-package-lock-phase.mjs';

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

// Ecommerce is independently installable, but its version is coordinated with
// the SDK train. Preserve exact independently versioned provider dependencies.
const independentProductRoots = ['apps/ecommerce-cms-agentsam'];
const coordinatedProductVersionFiles = [
  'apps/ecommerce-cms-agentsam/package.json',
  'apps/ecommerce-cms-agentsam/agentsam.app.json',
  'apps/ecommerce-cms-agentsam/package-lock.json',
  'apps/ecommerce-cms-agentsam/npm-shrinkwrap.json',
];
function isIndependentProduct(file) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  return independentProductRoots.some((app) => rel.startsWith(app + '/'));
}
const files = [
  rootManifestPath,
  ...walkPackageJson(path.join(root, 'packages')),
  ...walkPackageJson(path.join(root, 'apps')).filter((file) => !isIndependentProduct(file)),
];

const workspaces = files
  .map((file) => ({ file, manifest: read(file) }))
  .filter(({ manifest }) => manifest.name?.startsWith('@inneranimalmedia/'));
const workspaceNames = new Set(workspaces.map(({ manifest }) => manifest.name));
const workspaceByName = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest]));
const isIndependentlyVersioned = (manifest) => manifest.releaseTrain === 'independent';


function relative(file) {
  return path.relative(root, file) || 'package.json';
}

function expectedDependencyVersion(name) {
  // Exact first-party pins: independently released public packages use their
  // own version, while the coordinated SDK packages use the train version.
  const manifest = workspaceByName.get(name);
  return manifest && isIndependentlyVersioned(manifest) ? manifest.version : targetVersion;
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

// Stock feature packets declare the package they ship from; tests assert the
// packet version equals package.json, so it must move with the release train.
function featurePacketVersions() {
  const out = [];
  for (const { file, manifest } of workspaces) {
    if (manifest.private === true || isIndependentlyVersioned(manifest)) continue;
    const features = path.join(path.dirname(file), '.agentsam/features');
    if (!fs.existsSync(features)) continue;
    for (const entry of fs.readdirSync(features, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packet = path.join(features, entry.name, 'agentsam.feature.json');
      if (!fs.existsSync(packet)) continue;
      const json = read(packet);
      if (json.package?.name === manifest.name) out.push({ packet, json });
    }
  }
  return out;
}

// Apps, source themes and the ecommerce frontend are outside the public train
// but link to train packages. When their exact first-party pins or lock link
// metadata lag the packages on disk, `npm ci` fails with "lock file's X@new does
// not satisfy X@old". Registry-resolved lock entries are never touched.
const FIRST_PARTY_SCOPE = '@inneranimalmedia/';
const LOCK_DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
function appTreeDrift({ write }) {
  const notes = [];
  const manifestFiles = [...walkPackageJson(path.join(root, 'apps')), ...walkPackageJson(path.join(root, 'packages'))]
    .filter((file) => !path.relative(root, file).split(path.sep).includes('reference'));
  for (const file of manifestFiles) {
    const dir = path.dirname(file);
    const lockFiles = ['package-lock.json', 'npm-shrinkwrap.json'].map((name) => path.join(dir, name)).filter((lockFile) => fs.existsSync(lockFile));
    if (!lockFiles.length) continue;
    const manifest = read(file);
    const locks = lockFiles.map((lockFile) => ({ lockFile, lock: read(lockFile), changed: false }));
    const manifestEdits = [];
    for (const section of sections) {
      for (const [name, spec] of Object.entries(manifest[section] || {})) {
        const linked = workspaceByName.get(name);
        if (!linked || !/^\d+\.\d+\.\d+/.test(spec) || spec === linked.version) continue;
        if (!locks.some(({ lock }) => lock.packages?.[`node_modules/${name}`]?.link === true)) continue;
        notes.push(`${relative(file)}: ${section}.${name}=${spec} != linked workspace ${linked.version}`);
        manifestEdits.push({ name, from: spec, to: linked.version });
        manifest[section][name] = linked.version; // keeps the lock comparison below in this same pass
      }
    }
    for (const state of locks) {
      const { lockFile, lock } = state;
      const packages = lock.packages || {};
      const rootEntry = packages[''] || {};
      for (const section of sections) {
        for (const [name, spec] of Object.entries(manifest[section] || {})) {
          if (!name.startsWith(FIRST_PARTY_SCOPE) || rootEntry[section]?.[name] === undefined || rootEntry[section][name] === spec) continue;
          notes.push(`${relative(lockFile)}: root ${section}.${name}=${rootEntry[section][name]} != ${spec}`);
          rootEntry[section][name] = spec;
          state.changed = true;
        }
      }
      for (const [key, entry] of Object.entries(packages)) {
        // Lock keys inside any node_modules are installed registry copies, never workspace members; the untracked on-disk install must not decide drift.
        if (!key || key.split('/').includes('node_modules') || entry.link) continue;
        const targetFile = path.join(dir, key, 'package.json');
        if (!fs.existsSync(targetFile)) continue;
        const diskTarget = read(targetFile);
        // Read the current on-disk manifest: align() may have just updated a private nested product package.
        const target = diskTarget;
        if (target.version && entry.version !== target.version) {
          notes.push(`${relative(lockFile)}: ${key} version ${entry.version} != ${target.version}`);
          entry.version = target.version;
          state.changed = true;
        }
        for (const field of LOCK_DEP_FIELDS) {
          for (const [dep, range] of Object.entries(entry[field] || {})) {
            const want = target[field]?.[dep];
            if (!dep.startsWith(FIRST_PARTY_SCOPE) || want === undefined || want === range) continue;
            notes.push(`${relative(lockFile)}: ${key} ${field}.${dep}=${range} != ${want}`);
            entry[field][dep] = want;
            state.changed = true;
          }
        }
      }
    }
    if (write && manifestEdits.length) {
      // Targeted text edit: these manifests are hand-formatted, so never re-serialize them.
      const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let text = fs.readFileSync(file, 'utf8');
      for (const { name, from, to } of manifestEdits) {
        text = text.replace(new RegExp(`("${esc(name)}"\\s*:\\s*")${esc(from)}(")`, 'g'), `$1${to}$2`);
      }
      JSON.parse(text);
      fs.writeFileSync(file, text);
    }
    if (write) for (const { lockFile, lock, changed } of locks) if (changed) fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  }
  return notes;
}

const localStudioNestedPackageFiles = [
  'apps/local-studio/frontend/package.json',
  'apps/local-studio/backend/package.json',
  'apps/local-studio/shared/agentsam/package.json',
];
function localStudioNestedDrift({ write }) {
  const notes = [];
  // Before npm publication, Local Studio must resolve the last genuinely
  // published SDK tarball. Once the release manifest moves to published, it
  // must resolve the just-published train version instead.
  const localStudioCandidateVersion = read(path.join(root, 'apps/local-studio/package.json')).version;
  const localStudioSdkVersion = expectedSdkTarballVersion(root, localStudioCandidateVersion).version;
  for (const rel of localStudioNestedPackageFiles) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const manifest = read(file);
    const edits = [];
    if (manifest.version !== targetVersion) {
      edits.push('version ' + manifest.version + ' -> ' + targetVersion);
      manifest.version = targetVersion;
    }
    if (rel !== 'apps/local-studio/frontend/package.json') {
      const current = manifest.dependencies?.['@inneranimalmedia/agentsam-sdk'];
      if (current !== localStudioSdkVersion) {
        edits.push('dependencies.@inneranimalmedia/agentsam-sdk ' + current + ' -> ' + localStudioSdkVersion);
        manifest.dependencies ||= {};
        manifest.dependencies['@inneranimalmedia/agentsam-sdk'] = localStudioSdkVersion;
      }
    }
    if (!edits.length) continue;
    notes.push(relative(file) + ': ' + edits.join('; '));
    if (write) fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  return notes;
}

function check() {
  const failures = [];
  let dependencyEdges = 0;
  for (const edge of findPrivateWorkspaceDependencyEdges(workspaces, sections)) {
    failures.push(`${edge.consumer}: ${edge.section}.${edge.dependency} resolves to private workspace (${relative(edge.file)}); publish the dependency or remove it from the public dependency graph`);
  }
  for (const { file, manifest } of workspaces) {
    const isPrivate = manifest.private === true;
    const isPublic = !isPrivate && manifest.publishConfig?.access === 'public';
    if (!isPrivate && !isPublic) {
      failures.push((manifest.name || '<unnamed>') + ': package intent is ambiguous; set private=true or publishConfig.access=public (' + relative(file) + ')');
    }
    // Private app/source workspaces are excluded from the public npm release train.
    if (isPrivate) continue;
    if (manifest.releaseTrain && !['independent', 'coordinated'].includes(manifest.releaseTrain)) {
      failures.push(manifest.name + ': invalid releaseTrain policy ' + manifest.releaseTrain);
    }
    if (!isIndependentlyVersioned(manifest) && manifest.version !== targetVersion) {
      failures.push(`${manifest.name}: version ${manifest.version || '<missing>'} != ${targetVersion} (${relative(file)})`);
    }
    for (const section of sections) {
      for (const [name, spec] of Object.entries(manifest[section] || {})) {
        if (!workspaceNames.has(name)) continue;
        dependencyEdges += 1;
        const expected = expectedDependencyVersion(name);
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
  failures.push(...localStudioNestedDrift({ write: false }));
  failures.push(...appTreeDrift({ write: false }));
  for (const rel of coordinatedProductVersionFiles) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { failures.push(rel + ': coordinated product metadata missing'); continue; }
    const manifest = read(file);
    if (manifest.version !== targetVersion)
      failures.push(rel + ': ecommerce product release ' + manifest.version + ' != SDK ' + targetVersion);
    if (manifest.packages?.['']?.version && manifest.packages[''].version !== targetVersion)
      failures.push(rel + ': ecommerce lockfile root != SDK ' + targetVersion);
    if (rel.endsWith('/package.json') && (manifest.private || manifest.publishConfig?.access !== 'public'))
      failures.push(rel + ': ecommerce product must be publishable to npm');
  }

  const publicCount = workspaces.filter(({ manifest }) => manifest.private !== true && manifest.publishConfig?.access === 'public').length;
  const privateCount = workspaces.filter(({ manifest }) => manifest.private === true).length;
  for (const { packet, json } of featurePacketVersions()) {
    if (json.package.version !== targetVersion) failures.push(`${relative(packet)}: feature packet package.version ${json.package.version || '<missing>'} != ${targetVersion}`);
  }
  console.log(`AgentSam release train ${targetVersion}`);
  console.log(`  workspaces ${workspaces.length} · public ${publicCount} · private ${privateCount} · internal edges ${dependencyEdges}`);
  if (failures.length) {
    console.error(`  FAIL ${failures.length} release-train drift(s)`);
    for (const failure of failures) console.error(`    - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('  PASS all public release packages and dependency pins aligned');
}

function align() {
  let changedFiles = 0;
  let changedVersions = 0;
  let changedEdges = 0;
  for (const { file, manifest } of workspaces) {
    // Private source-only workspaces are not npm release-train packages.
    // Preserve file: dependencies and local versions during an SDK bump.
    if (manifest.private === true) continue;
    let changed = false;
    if (!isIndependentlyVersioned(manifest) && manifest.version !== targetVersion) {
      manifest.version = targetVersion;
      changedVersions += 1;
      changed = true;
    }
    for (const section of sections) {
      if (!manifest[section]) continue;
      for (const [name, spec] of Object.entries(manifest[section])) {
        if (!workspaceNames.has(name)) continue;
        const expected = expectedDependencyVersion(name);
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
  for (const { packet, json } of featurePacketVersions()) {
    if (json.package.version === targetVersion) continue;
    json.package.version = targetVersion;
    changedFiles += 1;
    changedVersions += 1;
    if (!dryRun) fs.writeFileSync(packet, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} feature packet ${targetVersion} · ${relative(packet)}`);
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
  for (const rel of coordinatedProductVersionFiles) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error('coordinated ecommerce metadata missing: ' + rel);
    const manifest = read(file);
    if (manifest.version === targetVersion && (!manifest.packages?.[''] || manifest.packages[''].version === targetVersion)) continue;
    manifest.version = targetVersion;
    if (manifest.packages?.['']) manifest.packages[''].version = targetVersion;
    changedFiles += 1;
    changedVersions += 1;
    if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} coordinated ecommerce product ${rel}@${targetVersion}`);
  }
  // Local Studio npm 10 product lock: first-party workspace/link entries follow
  // the train; registry-resolved entries keep their genuinely published version.
  {
    const rel = 'apps/local-studio/package-lock.json';
    const file = path.join(root, rel);
    if (fs.existsSync(file)) {
      const lock = read(file);
      const from = lock.version;
      if (from && from !== targetVersion) {
        const isRegistry = (entry) => typeof entry?.resolved === 'string' && /^https?:/.test(entry.resolved);
        lock.version = targetVersion;
        for (const entry of Object.values(lock.packages || {})) {
          if (isRegistry(entry)) continue;
          if (entry.version === from) entry.version = targetVersion;
          for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
            for (const [dep, range] of Object.entries(entry[field] || {})) {
              if (dep.startsWith('@inneranimalmedia/') && range === from) entry[field][dep] = targetVersion;
            }
          }
        }
        changedFiles += 1;
        changedVersions += 1;
        if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
        console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} local-studio npm10 lock ${from} -> ${targetVersion} · ${rel}`);
      }
    }
  }
  for (const note of localStudioNestedDrift({ write: !dryRun })) {
    changedFiles += 1;
    console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} local-studio nested package ${note}`);
  }
  for (const note of appTreeDrift({ write: !dryRun })) {
    changedFiles += 1;
    console.log(`${dryRun ? 'WOULD ALIGN' : 'ALIGNED'} app tree ${note}`);
  }
  console.log(`${dryRun ? 'DRY RUN' : 'DONE'} files=${changedFiles} versions=${changedVersions} dependency_pins=${changedEdges}`);
}

if (mode === 'check') check();
else if (mode === 'align') align();
else {
  console.error('Usage: node scripts/release-train.mjs check [version] | align [version] [--dry-run]');
  process.exitCode = 2;
}
