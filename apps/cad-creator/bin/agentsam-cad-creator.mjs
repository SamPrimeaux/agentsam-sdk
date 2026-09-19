#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  probeAllCadTools,
  getCadConfigPath,
  loadCadConfig,
  saveCadConfig,
  getInstallGuidance,
} from './cad-discovery.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.log(`
AgentSam CAD Creator

  agentsam-cad-creator [preview] [--port 3000]
  agentsam-cad-creator scaffold <directory>
  agentsam-cad-creator doctor [--json]
  agentsam-cad-creator setup [--install] [--json]
  agentsam-cad-creator info

preview
  Run the packaged production UI locally. No build step required.
  GEMINI_API_KEY is optional for viewing the UI and required only for AI-backed calls.

doctor
  Check local runtime health, packaged assets, and probe CAD engines.
  Pass --json for programmatic machine discovery output.

setup
  Run local-machine discovery, probe PATH & OS standard install paths,
  and cache executable binary paths in ~/.agentsam/cad.json.
  Optionally pass --install on macOS to invoke brew for missing tools.

scaffold
  Materialize the editable frontend/backend/shared source into a normal project.
  Then run: npm install && npm run dev

info
  Print the AgentSam app manifest.
`.trim());
}

function valueAfter(flag, args) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function copyPath(relative, targetRoot) {
  const source = path.join(packageRoot, relative);
  if (!fs.existsSync(source)) return;
  const target = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: false });
}

function scaffoldRootPackage(targetRoot) {
  const targetName = path.basename(targetRoot)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agentsam-cad-project';
  const pkg = {
    name: targetName,
    version: '0.0.0',
    private: true,
    type: 'module',
    workspaces: ['frontend', 'backend', 'shared/*'],
    scripts: {
      dev: 'npm run dev -w @inneranimalmedia/agentsam-cad-backend',
      build: 'npm run build -w @inneranimalmedia/agentsam-cad-frontend && npm run build -w @inneranimalmedia/agentsam-cad-backend',
      start: 'npm run start -w @inneranimalmedia/agentsam-cad-backend',
      preview: 'npm run preview -w @inneranimalmedia/agentsam-cad-frontend',
      typecheck: 'npm run typecheck --workspaces --if-present',
      test: 'npm run test --workspaces --if-present',
      clean: 'rm -rf frontend/dist backend/dist coverage',
      'cf:dry-run': 'npm run build && wrangler deploy -c backend/wrangler.jsonc --dry-run'
    },
    devDependencies: {
      wrangler: '4.130.0'
    }
  };
  fs.writeFileSync(path.join(targetRoot, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

function scaffold(targetArg) {
  if (!targetArg) throw new Error('scaffold requires a target directory');
  const targetRoot = path.resolve(process.cwd(), targetArg);
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length) {
    throw new Error(`target directory is not empty: ${targetRoot}`);
  }
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const relative of [
    '.env.example',
    'README.md',
    'agentsam.app.json',
    'frontend/index.html',
    'frontend/package.json',
    'frontend/tsconfig.json',
    'frontend/vite.config.ts',
    'frontend/public',
    'frontend/src',
    'backend/.dev.vars.example',
    'backend/package.json',
    'backend/tsconfig.json',
    'backend/wrangler.jsonc',
    'backend/src',
    'backend/worker',
    'shared/cad'
  ]) {
    copyPath(relative, targetRoot);
  }

  scaffoldRootPackage(targetRoot);
  console.log(`Created AgentSam CAD Creator scaffold at ${targetRoot}`);
  console.log('Next:');
  console.log(`  cd ${targetRoot}`);
  console.log('  npm install');
  console.log('  npm run dev');
}

async function preview(args) {
  const port = valueAfter('--port', args) || process.env.PORT || '3000';
  if (!/^\d+$/.test(String(port))) throw new Error(`invalid --port: ${port}`);

  const server = path.join(packageRoot, 'backend', 'dist', 'server.cjs');
  const index = path.join(packageRoot, 'frontend', 'dist', 'index.html');
  if (!fs.existsSync(server) || !fs.existsSync(index)) {
    throw new Error('packaged build output is missing; reinstall the package or run npm run build from source');
  }

  process.env.NODE_ENV = 'production';
  process.env.PORT = String(port);
  process.chdir(path.join(packageRoot, 'backend'));
  console.log(`AgentSam CAD Creator → http://127.0.0.1:${port}`);
  console.log('Press Ctrl-C to stop.');
  await import(pathToFileURL(server).href);
}

async function runDoctor(args = []) {
  const isJson = args.includes('--json');
  const server = path.join(packageRoot, 'backend', 'dist', 'server.cjs');
  const index = path.join(packageRoot, 'frontend', 'dist', 'index.html');
  const configPath = getCadConfigPath();
  const configExists = fs.existsSync(configPath);

  const cadReport = await probeAllCadTools(process.env, process.platform, true);

  if (isJson) {
    console.log(JSON.stringify({
      package_root: packageRoot,
      frontend_build: fs.existsSync(index) ? 'ready' : 'missing',
      backend_build: fs.existsSync(server) ? 'ready' : 'missing',
      node_version: process.version,
      config_path: configPath,
      config_exists: configExists,
      cad: cadReport,
    }, null, 2));
    return;
  }

  console.log('AgentSam CAD Creator Doctor');
  console.log(`  Package root:   ${packageRoot}`);
  console.log(`  Frontend build: ${fs.existsSync(index) ? 'ready' : 'missing'}`);
  console.log(`  Backend build:  ${fs.existsSync(server) ? 'ready' : 'missing'}`);
  console.log(`  Node version:   ${process.version}`);
  console.log(`  Config cache:   ${configExists ? configPath : '(none yet - run setup to cache)'}`);
  console.log(`  Workspaces:     plan, model, parametric, robotics, render`);
  console.log('');
  console.log('CAD Engines & Discovery:');

  const missingTools = [];

  for (const tool of cadReport.tools) {
    const symbol = tool.available ? '✓' : '○';
    const statusText = tool.available
      ? `${tool.binary || 'available'} (${tool.version || 'unknown version'}) [${tool.execution_lane} / ${tool.source}]`
      : `not found [${tool.execution_lane}]`;
    console.log(`  ${symbol} ${tool.name.padEnd(24)} ${statusText}`);

    if (!tool.available && tool.install_guidance) {
      missingTools.push(tool);
    }
  }

  if (missingTools.length > 0) {
    console.log('');
    console.log('Recommended Engine Installations:');
    for (const tool of missingTools) {
      console.log(`  • ${tool.name}:`);
      console.log(`      ${tool.install_guidance.command}`);
      console.log(`      URL: ${tool.install_guidance.url}`);
    }
    console.log('');
    console.log('  Run "agentsam-cad-creator setup" to probe and cache paths, or set AGENTSAM_<TOOL>_BIN.');
  } else {
    console.log('');
    console.log('All local CAD engines are operational.');
  }
}

async function runSetup(args = []) {
  const isJson = args.includes('--json');
  const doInstall = args.includes('--install');
  const configPath = getCadConfigPath();

  console.log('Probing machine for CAD engines across PATH and standard OS locations...');
  const cadReport = await probeAllCadTools(process.env, process.platform, true);

  if (isJson) {
    console.log(JSON.stringify({
      config_path: configPath,
      report: cadReport,
    }, null, 2));
    return;
  }

  console.log(`Updated cache at: ${configPath}`);
  console.log('');
  for (const tool of cadReport.tools) {
    if (tool.available && tool.binary) {
      console.log(`  ✓ ${tool.name}: ${tool.binary} (${tool.version || 'detected'})`);
    } else if (tool.available) {
      console.log(`  ✓ ${tool.name}: ${tool.version || 'ready'} [${tool.source}]`);
    } else {
      console.log(`  ✗ ${tool.name}: missing`);
      if (tool.install_guidance) {
        console.log(`      Install command: ${tool.install_guidance.command}`);
      }
    }
  }

  if (doInstall) {
    const { execSync } = await import('node:child_process');
    const missing = cadReport.tools.filter(t => !t.available && t.install_guidance?.command);
    for (const tool of missing) {
      console.log(`\nExecuting: ${tool.install_guidance.command}`);
      try {
        execSync(tool.install_guidance.command, { stdio: 'inherit', shell: true });
      } catch (err) {
        console.error(`Failed to install ${tool.name}: ${err.message}`);
      }
    }
    console.log('\nRe-probing tools...');
    await probeAllCadTools(process.env, process.platform, true);
  }
}

const args = process.argv.slice(2);
const first = args[0];
const command = first === '--help' || first === '-h' ? 'help' : first && !first.startsWith('-') ? first : 'preview';

try {
  if (command === 'preview') {
    await preview(command === args[0] ? args.slice(1) : args);
  } else if (command === 'scaffold') {
    scaffold(args[1]);
  } else if (command === 'doctor') {
    await runDoctor(command === args[0] ? args.slice(1) : args);
  } else if (command === 'setup' || command === 'install') {
    await runSetup(command === args[0] ? args.slice(1) : args);
  } else if (command === 'info') {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'agentsam.app.json'), 'utf8'));
    console.log(JSON.stringify(manifest, null, 2));
  } else if (command === 'help') {
    usage();
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`agentsam-cad-creator: ${error?.message || error}`);
  process.exitCode = 1;
}
