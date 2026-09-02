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
for (const key of Object.keys(childEnv)) if (/^npm_config_allow[_-]scripts$/i.test(key)) delete childEnv[key];
const run = (bin, args, cwd) => execFileSync(bin, args, { cwd, env: childEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tmp], root))[0];
  const shipped = new Set(packed.files.map(f => f.path));
  for (const file of ['src/knowledge/engine.js', 'src/knowledge/stores/postgres.sql', 'protocol/knowledge/context-pack.schema.json', 'python/agentsam_sdk/repository/intelligence/__main__.py', 'docs/knowledge-branch-recovery.md']) assert.ok(shipped.has(file), `Missing packed asset: ${file}`);
  const consumer = path.join(tmp, 'consumer'); fs.mkdirSync(consumer);
  // Explicitly allow no lifecycle scripts, including when the parent npm exports allow-scripts.
  fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module","allowScripts":{}}\n');
  run('npm', ['install', path.join(tmp, packed.filename), '--ignore-scripts', '--no-audit', '--no-fund', ...(process.argv.includes('--offline') ? ['--offline'] : [])], consumer);
  const installed = path.join(consumer, 'node_modules/@inneranimalmedia/agentsam-sdk/src/cli.js');
  const exported = run(process.execPath, ['--input-type=module', '-e', 'import {runIndex, KnowledgeClient} from "@inneranimalmedia/agentsam-sdk/knowledge"; console.log(typeof runIndex, typeof KnowledgeClient)'], consumer);
  assert.equal(exported.trim(), 'function function');
  for (const name of ['warehouse', 'design-system']) {
    const repo = path.join(tmp, name); fs.mkdirSync(path.join(repo, 'lib'), { recursive: true });
    run('git', ['init', '-q'], repo);
    fs.writeFileSync(path.join(repo, 'lib/task.ts'), 'export function customerFeature() { return 42; }\n');
    const cli = args => JSON.parse(run(process.execPath, [installed, ...args], repo));
    cli(['init', '--yes', '--include', 'lib']);
    assert.equal(cli(['index', 'plan']).embedding_inputs, 0);
    assert.equal(cli(['index', 'run']).published, true);
    assert.equal(cli(['index', 'run']).published, false);
    assert.equal(cli(['search', 'customerFeature']).hits[0].path, 'lib/task.ts');
    cli(['repo', 'snapshot', '--save']);
    fs.appendFileSync(path.join(repo, 'lib/task.ts'), 'export const nextFeature = true;\n');
    cli(['repo', 'snapshot', '--save']);
    assert.equal(cli(['repo', 'compare']).counts.total_lines.delta, 1);
    assert.equal(cli(['repo', 'history']).length, 2);
  }
  console.log(`verify-knowledge-package OK: installed ${packed.filename}; two independent repositories, retrieval and saved evolution`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
