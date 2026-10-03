import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-consumer-'));
// npm run exports allow-scripts as an environment option, which newer npm rejects
// for nested project installs. Remove that inherited allowance in the child only;
// --ignore-scripts and the consumer's empty allowScripts still prohibit all hooks.
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) {
  if (/^npm_config_(?:allow[_-]?scripts|dry[_-]?run)$/i.test(key)) delete childEnv[key];
}
const run = (bin, args, cwd) => execFileSync(bin, args, { cwd, env: childEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const workspaces = JSON.parse(run('npm', ['query', '.workspace', '--json'], root));
  const workspaceByName = new Map(
    workspaces
      .filter(row => row?.name && row?.location)
      .map(row => [row.name, path.join(root, row.location)])
  );

  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp], root)
  )[0];

  const localFirstPartyTarballs = [];
  const firstPartyDependencies = Object.keys(rootManifest.dependencies || {})
    .filter(name => name.startsWith('@inneranimalmedia/'));

  for (const name of firstPartyDependencies) {
    const workspaceDir = workspaceByName.get(name);
    assert.ok(workspaceDir, `First-party dependency is not a workspace: ${name}`);

    const dependencyPack = JSON.parse(
      run(
        'npm',
        ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp],
        workspaceDir
      )
    )[0];

    localFirstPartyTarballs.push(path.join(tmp, dependencyPack.filename));
  }

  const installReleaseCandidate = cwd =>
    run(
      'npm',
      [
        'install',
        ...localFirstPartyTarballs,
        path.join(tmp, packed.filename),
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...(process.argv.includes('--offline') ? ['--offline'] : [])
      ],
      cwd
    );

  const shipped = new Set(packed.files.map(f => f.path));
  for (const file of ['src/knowledge/engine.js', 'src/knowledge/stores/postgres.sql', 'packages/agentsam-knowledge/src/autorag/index.js', 'protocol/knowledge/context-pack.schema.json', 'python/agentsam_sdk/repository/intelligence/__main__.py', 'docs/knowledge-branch-recovery.md']) assert.ok(shipped.has(file), `Missing packed asset: ${file}`);
  const consumer = path.join(tmp, 'consumer'); fs.mkdirSync(consumer);
  // Explicitly allow no lifecycle scripts, including when the parent npm exports allow-scripts.
  fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module","allowScripts":{}}\n');
  installReleaseCandidate(consumer);
  const installed = path.join(consumer, 'node_modules/@inneranimalmedia/agentsam-sdk/src/cli.js');
  const exported = run(process.execPath, ['--input-type=module', '-e', 'import {runIndex, KnowledgeClient} from "@inneranimalmedia/agentsam-sdk/knowledge"; console.log(typeof runIndex, typeof KnowledgeClient)'], consumer);
  assert.equal(exported.trim(), 'function function');
  const autoragExport = run(process.execPath, ['--input-type=module', '-e', 'import {discoverAutoRag, runAutoRagProbe} from "@inneranimalmedia/agentsam-sdk/autorag"; console.log(typeof discoverAutoRag, typeof runAutoRagProbe)'], consumer);
  assert.equal(autoragExport.trim(), 'function function');
  const clientExport = run(process.execPath, ['--input-type=module', '-e', 'import {createKnowledgeServiceClient} from "@inneranimalmedia/agentsam-sdk/knowledge-service-client"; console.log(typeof createKnowledgeServiceClient)'], consumer);
  assert.equal(clientExport.trim(), 'function');
  // Prove the installed package can generate and run a fresh application too.
  // Install this tarball into the fixture so unpublished release candidates never
  // silently test an older registry release.
  run(process.execPath, [installed, 'init', '--name', 'fresh-app', '--yes'], tmp);
  const app = path.join(tmp, 'fresh-app');
  const manifest = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@inneranimalmedia/agentsam-sdk'], packed.version.includes('-') ? packed.version : `^${packed.version}`);
  installReleaseCandidate(app);
  run('npm', ['run', 'smoke'], app);
  for (const name of ['warehouse', 'design-system']) {
    const repo = path.join(tmp, name); fs.mkdirSync(path.join(repo, 'lib'), { recursive: true });
    run('git', ['init', '-q'], repo);
    fs.writeFileSync(path.join(repo, 'lib/task.ts'), 'export function customerFeature() { return 42; }\n');
    const cli = args => JSON.parse(run(process.execPath, [installed, ...args], repo));
    cli(['autorag', 'setup', '--yes', '--kind', 'code', '--scope', 'lib']);
    assert.equal(cli(['autorag', 'status']).config.scope.include[0], 'lib');
    assert.equal(cli(['autorag', 'doctor']).ok, true);
    assert.ok(cli(['autorag', 'probe', '--query', 'customerFeature']).generation);
    assert.equal(cli(['index', 'plan']).embedding_inputs, 0);
    assert.equal(cli(['index', 'run']).published, true);
    assert.equal(cli(['index', 'run']).published, false);
    assert.equal(cli(['search', 'customerFeature']).hits[0].path, 'lib/task.ts');
    cli(['repo', 'snapshot', '--save', '--json']);
    fs.appendFileSync(path.join(repo, 'lib/task.ts'), 'export const nextFeature = true;\n');
    cli(['repo', 'snapshot', '--save', '--json']);
    assert.equal(cli(['repo', 'compare', '--json']).counts.total_lines.delta, 1);
    assert.equal(cli(['repo', 'history', '--json']).length, 2);
    run(process.execPath, [installed, 'dockerize', '--type', 'knowledge_service', '--name', `knowledge-${name}`, '--repository', `${name}=${repo}`, '--write-only'], repo);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, '.agentsam/docker/index.json'), 'utf8'));
    const build = Object.values(manifest)[0];
    assert.ok(fs.existsSync(path.join(path.dirname(build.dockerfilePath), 'context/package-lock.json')));
    assert.ok(fs.existsSync(path.join(path.dirname(build.dockerfilePath), 'context/src/knowledge/service/server.js')));
    assert.equal(fs.existsSync(path.join(path.dirname(build.dockerfilePath), 'context/lib/task.ts')), false);
  }
  console.log(`verify-knowledge-package OK: installed ${packed.filename}; two unrelated consumers passed installed AutoRAG setup/status/doctor/probe, index/search, retrieval, evolution, and optional Docker service staging`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
