import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'src', 'cli.js');
const sdkPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-bootstrap-'));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || root,
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
  assert.equal(result.status, 0, `CLI failed: agentsam ${args.join(' ')}`);
  return result;
}

async function verifyInteractiveInit(target, answer, laneAnswer = '1', expectedLane = 'fullstack') {
  const { spawn } = await import('node:child_process');
  const calls = path.join(tmp, `credential-probes-${target}.log`);
  const preload = path.join(tmp, `credential-probes-${target}.mjs`);
  fs.writeFileSync(preload, `
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const record = (kind) => fs.appendFileSync(${JSON.stringify(calls)}, kind + '\\n');
    childProcess.execFile = (command, ...args) => {
      record(command);
      const callback = args.at(-1);
      queueMicrotask(() => callback(new Error('credential probe stubbed')));
      return { kill() {} };
    };
    syncBuiltinESMExports();
    globalThis.fetch = async () => {
      record('fetch');
      throw new Error('network probe stubbed');
    };
  `);
  const questions = [
    ['1) Project name:', `interactive-${target}`],
    ['Pick lane [1-5]:', laneAnswer],
    ['Select [1]:', answer],
  ];
  let output = '';
  let question = 0;
  const child = spawn(process.execPath, ['--import', preload, cli, 'init'], {
    cwd: tmp,
    env: { ...process.env, AGENTSAM_SDK_TOKEN: '', NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`interactive ${target} init timed out: ${output}`));
    }, 20_000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdin.on('error', (error) => { child.kill(); reject(error); });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (question < questions.length && output.includes(questions[question][0])) {
        if (fs.existsSync(calls)) {
          child.kill();
          reject(new Error('init probed credentials before the deploy target was chosen'));
          return;
        }
        child.stdin.write(questions[question++][1] + '\n');
      }
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`interactive init exited ${code}: ${output}`));
      else resolve();
    });
  });
  assert.equal(question, questions.length, 'wizard must ask all three questions');
  assert.equal(fs.existsSync(calls), target !== 'local',
    'local init must skip credential probes; cloud targets retain deferred detection');
  if (target === 'local') assert.ok(!output.includes('Detected credentials'));
  const project = path.join(tmp, `interactive-${target}`);
  const config = JSON.parse(fs.readFileSync(path.join(project, '.agentsam/config.json'), 'utf8'));
  assert.equal(config.run_target, 'local');
  assert.equal(config.lane, expectedLane, 'numbered lane must select the requested scaffold');
  assert.equal(config.deploy_target, target === 'local' ? null : target);
  assert.ok(fs.existsSync(path.join(project, '.agentsam/data/agentsam.sqlite')));
}

try {
  await verifyInteractiveInit('local', '1', '3', 'data');
  await verifyInteractiveInit('cloudflare', '2');
  await verifyInteractiveInit('gcp', '3');
  run(['init', '--name', 'my-agent', '--lane', 'fullstack', '--run-target', 'local', '--yes'], {
    cwd: tmp,
  });

  const project = path.join(tmp, 'my-agent');
  const generatedPackage = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(project, '.agentsam', 'config.json'), 'utf8'));

  assert.equal(generatedPackage.scripts?.smoke, 'node --env-file=.env ./scripts/smoke.mjs');
  assert.equal(generatedPackage.scripts?.status, 'agentsam status');
  assert.equal(generatedPackage.scripts?.pty, 'agentsam start-local');
  assert.equal(generatedPackage.scripts?.['db:status'], 'agentsam db status');
  assert.equal(generatedPackage.scripts?.tui, 'agentsam tui');
  assert.equal(
    generatedPackage.dependencies?.['@inneranimalmedia/agentsam-sdk'],
    sdkPackage.version,
    'prerelease scaffolds must install the exact SDK version that generated them',
  );
  assert.equal(config.project, 'my-agent');
  assert.equal(config.run_target, 'local');
  assert.equal(config.db_path, '.agentsam/data/agentsam.sqlite');
  assert.equal(config.ui, 'terminal');
  assert.ok(fs.existsSync(path.join(project, '.git')));
  assert.ok(fs.existsSync(path.join(project, '.env')));
  assert.ok(fs.existsSync(path.join(project, '.env.example')));
  assert.ok(fs.existsSync(path.join(project, 'db', 'schema.sql')));
  assert.ok(fs.existsSync(path.join(project, '.agentsam', 'data', 'agentsam.sqlite')));
  assert.ok(fs.existsSync(path.join(project, 'src', 'agent.js')));
  assert.ok(fs.existsSync(path.join(project, 'scripts', 'smoke.mjs')));
  assert.ok(!fs.existsSync(path.join(project, 'wrangler.toml')));
  assert.ok(!fs.existsSync(path.join(project, 'gorilla')));

  run(['status', '--json'], { cwd: project });
  run(['tui'], { cwd: project });
  run(['tui', '--scene', 'dashboard', '--check']);
  run(['db', 'status'], { cwd: project });

  console.log(`verify-bootstrap OK ${sdkPackage.name}@${sdkPackage.version}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
