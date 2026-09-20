#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(packageRoot, 'agentsam.app.json');
const provenancePath = path.join(packageRoot, 'IMPORT_PROVENANCE.json');

function usage() {
  console.log(`
AgentSam Ecommerce + CMS

  agentsam-ecommerce [preview]
  agentsam-ecommerce info
  agentsam-ecommerce doctor [--json]
  agentsam-ecommerce scaffold <directory>

preview
  Run the built local web preview from the app-owned frontend workspace.
  The preview uses the mock AdminHost adapter and does not perform production writes.

info
  Print the AgentSam app manifest.

doctor
  Verify package, frontend runtime, donor provenance, and manifest truth.

scaffold
  Copy the editable app package, frontend source, provider references, and
  preserved donor reference into an empty directory.
`.trim());
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`app manifest missing: ${manifestPath}`);
  }
  return readJson(manifestPath);
}

function exists(relative) {
  return fs.existsSync(path.join(packageRoot, relative));
}

function inspectState() {
  const manifest = readManifest();
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath) ? readJson(packageJsonPath) : null;

  const previewScript = packageJson?.scripts?.preview
    ? 'preview'
    : packageJson?.scripts?.dev
      ? 'dev'
      : null;

  const sourceRequired = [
    'frontend/src',
    'reference/gemini-remixed-dashboard-seed',
    'reference/fuelnfreetime/COMPLETEFUL_RUNTIME_CONTRACT.md',
    'providers/completeful/reference',
    'agentsam.app.json',
    'IMPORT_PROVENANCE.json',
    'package.json',
    'package-lock.json',
    'frontend/package.json',
    'frontend/index.html',
    'frontend/vite.config.ts',
    'bin/agentsam-ecommerce.mjs',
  ];

  const missingSource = sourceRequired.filter((relative) => !exists(relative));
  const runnable = Boolean(packageJson && previewScript);

  const declaresNotBuildable = manifest.runtime?.local_preview === 'not-buildable';
  const declaresPartialHarvest = manifest.runtime?.source_scaffold === 'partial-harvest';

  const contradictions = [];
  if (missingSource.length) {
    contradictions.push(`missing rescued source contract: ${missingSource.join(', ')}`);
  }
  if (!runnable && !declaresNotBuildable) {
    contradictions.push(
      `manifest local_preview=${manifest.runtime?.local_preview ?? 'unset'} but no runnable package preview/dev script exists`,
    );
  }
  if (!packageJson && !declaresPartialHarvest) {
    contradictions.push(
      `manifest source_scaffold=${manifest.runtime?.source_scaffold ?? 'unset'} but package.json is absent`,
    );
  }
  if (manifest.bin && manifest.bin !== 'bin/agentsam-ecommerce.mjs') {
    contradictions.push(`manifest bin points to unexpected executable: ${manifest.bin}`);
  }

  return {
    app_id: manifest.id,
    package_root: packageRoot,
    node_version: process.version,
    manifest_runtime: manifest.runtime || {},
    source: {
      frontend: exists('frontend/src'),
      provider_reference: exists('providers/completeful/reference'),
      donor_reference: exists('reference/gemini-remixed-dashboard-seed'),
      provenance: fs.existsSync(provenancePath),
      missing: missingSource,
    },
    runtime: {
      package_json: Boolean(packageJson),
      preview_script: previewScript,
      runnable,
    },
    contract_consistent: contradictions.length === 0,
    contradictions,
  };
}

function info() {
  console.log(JSON.stringify(readManifest(), null, 2));
}

function doctor(args = []) {
  const state = inspectState();
  if (args.includes('--json')) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log('AgentSam Ecommerce + CMS Doctor');
    console.log(`  Root:             ${state.package_root}`);
    console.log(`  Frontend source:  ${state.source.frontend ? 'present' : 'missing'}`);
    console.log(`  Completeful refs: ${state.source.provider_reference ? 'present' : 'missing'}`);
    console.log(`  Donor reference:  ${state.source.donor_reference ? 'present' : 'missing'}`);
    console.log(`  Provenance:       ${state.source.provenance ? 'present' : 'missing'}`);
    console.log(`  Package runtime:  ${state.runtime.package_json ? 'present' : 'not created yet'}`);
    console.log(`  Preview:          ${state.runtime.runnable ? 'runnable' : 'not buildable yet'}`);
    console.log(`  Manifest truth:   ${state.contract_consistent ? 'consistent' : 'contradictory'}`);

    if (!state.runtime.runnable) {
      console.log('');
      console.log('  Current state is an intentional partial source harvest.');
      console.log('  Complete the package/runtime contract before enabling preview.');
    }

    if (state.contradictions.length) {
      console.log('');
      for (const contradiction of state.contradictions) {
        console.error(`  ✗ ${contradiction}`);
      }
    }
  }

  if (!state.contract_consistent) process.exitCode = 1;
  return state;
}

function copyPath(relative, targetRoot) {
  const source = path.join(packageRoot, relative);
  if (!fs.existsSync(source)) return;
  const target = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: false });
}

function scaffold(targetArg) {
  if (!targetArg) throw new Error('scaffold requires a target directory');
  const targetRoot = path.resolve(process.cwd(), targetArg);

  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length) {
    throw new Error(`target directory is not empty: ${targetRoot}`);
  }

  fs.mkdirSync(targetRoot, { recursive: true });

  for (const relative of [
    'AGENTS.md',
    'README.md',
    '.gitignore',
    'IMPORT_PROVENANCE.json',
    'agentsam.app.json',
    'package.json',
    'package-lock.json',
    'bin',
    'frontend',
    'providers',
    'reference',
  ]) {
    copyPath(relative, targetRoot);
  }

  console.log(`✓ scaffolded AgentSam Ecommerce + CMS source into ${targetRoot}`);
  console.log('  State: source-ready / local-preview-ready');
  console.log('  Next: npm install && npm run dev');
}

function preview(args = []) {
  const manifest = readManifest();
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const frontendPackagePath = path.join(packageRoot, 'frontend', 'package.json');

  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(frontendPackagePath)) {
    throw new Error(
      `preview unavailable: manifest declares local_preview=${manifest.runtime?.local_preview ?? 'unknown'} but the app package/runtime is incomplete`,
    );
  }

  const frontendPkg = readJson(frontendPackagePath);
  const script = frontendPkg.scripts?.preview ? 'preview' : frontendPkg.scripts?.dev ? 'dev' : null;
  if (!script) {
    throw new Error('preview unavailable: frontend/package.json has no preview or dev script');
  }

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', script, '--', ...args], {
    cwd: path.join(packageRoot, 'frontend'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

const [cmd = 'preview', ...rest] = process.argv.slice(2);

try {
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') usage();
  else if (cmd === 'info') info();
  else if (cmd === 'doctor') doctor(rest);
  else if (cmd === 'scaffold') scaffold(rest[0]);
  else if (cmd === 'preview') preview(rest);
  else {
    console.error(`unknown command: ${cmd}`);
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`agentsam-ecommerce: ${error?.message || error}`);
  process.exitCode = 1;
}
