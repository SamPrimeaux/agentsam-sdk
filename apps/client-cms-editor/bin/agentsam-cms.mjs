#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdkRoot = path.resolve(packageRoot, '../..');
const manifestPath = path.join(packageRoot, 'agentsam.app.json');
const PERSISTENCE = new Set(['sqlite', 'd1']);

function usage() {
  console.log(`
AgentSam CMS Editor

  agentsam-cms [preview]
  agentsam-cms info
  agentsam-cms doctor
  agentsam-cms scaffold <directory> [--persistence sqlite|d1]

preview
  Run the app preview script when present.

info
  Print the AgentSam app manifest.

doctor
  Verify frontend/backend/shared layout.

scaffold
  Copy editable source into a new directory.
  sqlite       local authority for desktop/offline use
  d1           cloud authority through a CmsEditorAdapter (proven cloud resources only)
  localStorage is never a persistence choice — UI chrome cache only
`.trim());
}

function info() {
  console.log(JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), null, 2));
}

function doctor() {
  const required = ['frontend', 'backend', 'shared', 'bin', 'package.json', 'agentsam.app.json'];
  const missing = required.filter((rel) => !fs.existsSync(path.join(packageRoot, rel)));
  if (missing.length) {
    console.error('doctor failed; missing:', missing.join(', '));
    process.exit(1);
  }
  console.log('✓ client-cms-editor layout ok');
}

function parseScaffoldArgs(args) {
  const target = args[0];
  let persistence = 'sqlite';
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--persistence') {
      persistence = String(args[i + 1] || '').trim();
      i += 1;
    }
  }
  if (!PERSISTENCE.has(persistence)) {
    throw new Error(`unsupported persistence "${persistence}"; choose sqlite or d1 (localStorage is cache-only, not authority)`);
  }
  return { target, persistence };
}

const COPY_SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', '.wrangler', '.agentsam']);

function copySource(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    filter(candidate) {
      if (candidate === source) return true;
      return !candidate
        .split(path.sep)
        .some((part) => COPY_SKIP.has(part));
    },
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}
`);
}

function makeStandaloneWorkspace(targetRoot) {
  const rootPackage = path.join(targetRoot, 'package.json');
  const rootPkg = readJson(rootPackage);
  rootPkg.workspaces = [...new Set([...(rootPkg.workspaces || []), 'packages/*'])];
  writeJson(rootPackage, rootPkg);

  const packageFiles = [
    path.join(targetRoot, 'frontend/package.json'),
    path.join(targetRoot, 'shared/cms/package.json'),
  ];
  for (const file of packageFiles) {
    if (!fs.existsSync(file)) continue;
    const pkg = readJson(file);
    for (const section of ['dependencies', 'devDependencies']) {
      if (!pkg[section]) continue;
      for (const name of [
        '@inneranimalmedia/agentsam-contracts',
        '@inneranimalmedia/agentsam-workbench',
      ]) {
        if (pkg[section][name]?.startsWith?.('file:')) pkg[section][name] = '0.1.0';
      }
    }
    writeJson(file, pkg);
  }
}

function runtimeConfig(persistence) {
  if (persistence === 'sqlite') {
    return {
      schema: 'agentsam.cms.runtime.v1',
      app_id: 'client-cms-editor',
      run_target: 'local',
      authority: 'sqlite',
      cache: 'localStorage',
      cache_only: false,
    };
  }
  if (persistence === 'd1') {
    return {
      schema: 'agentsam.cms.runtime.v1',
      app_id: 'client-cms-editor',
      run_target: 'cloudflare',
      authority: 'd1',
      cache: 'localStorage',
      cache_only: false,
      note: 'D1 authority must come from a proven OAuth/connection resource via CmsEditorAdapter — never an invented Worker binding product source.',
    };
  }
  throw new Error(`unsupported persistence "${persistence}"`);
}

function scaffold(targetArg, { persistence = 'sqlite' } = {}) {
  if (!targetArg) throw new Error('scaffold requires a target directory');
  const targetRoot = path.resolve(process.cwd(), targetArg);
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length) {
    throw new Error(`target directory is not empty: ${targetRoot}`);
  }
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const relative of [
    'frontend',
    'backend',
    'shared',
    'bin',
    '.gitignore',
    'package.json',
    'README.md',
    'agentsam.app.json',
    'IMPORT_PROVENANCE.json',
  ]) {
    const source = path.join(packageRoot, relative);
    if (!fs.existsSync(source)) continue;
    copySource(source, path.join(targetRoot, relative));
  }

  const portablePackages = [
    'agentsam-contracts',
    'agentsam-workbench',
  ];
  for (const name of portablePackages) {
    const source = path.join(sdkRoot, 'packages', name);
    if (!fs.existsSync(source)) {
      throw new Error(`required scaffold package missing: packages/${name}`);
    }
    copySource(source, path.join(targetRoot, 'packages', name));
  }
  makeStandaloneWorkspace(targetRoot);

  const stateDir = path.join(targetRoot, '.agentsam');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cms-runtime.json'),
    `${JSON.stringify(runtimeConfig(persistence), null, 2)}\n`,
  );

  console.log(`✓ scaffolded CMS editor into ${targetRoot}`);
  console.log(`  persistence authority: ${persistence} (localStorage remains cache-only)`);
}

function preview(args) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts?.preview ? 'preview' : pkg.scripts?.dev ? 'dev' : null;
  if (!script) {
    console.error('no preview/dev script in package.json');
    process.exit(1);
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', script, '--', ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

const [cmd = 'preview', ...rest] = process.argv.slice(2);
try {
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') usage();
  else if (cmd === 'info') info();
  else if (cmd === 'doctor') doctor();
  else if (cmd === 'scaffold') {
    const { target, persistence } = parseScaffoldArgs(rest);
    scaffold(target, { persistence });
  } else if (cmd === 'preview') preview(rest);
  else {
    console.error(`unknown command: ${cmd}`);
    usage();
    process.exit(1);
  }
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
}
