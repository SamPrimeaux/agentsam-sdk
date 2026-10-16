#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  probeAllCadTools,
  getCadConfigPath,
  loadCadConfig,
  saveCadConfig,
  getInstallGuidance,
  probeDockerDaemon,
  probeDockerServiceHealth,
} from './cad-discovery.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.log(`
AgentSam CAD Creator

  agentsam-cad-creator [preview] [--port 3000]
  agentsam-cad-creator scaffold <directory>
  agentsam-cad-creator bim import <file.FCStd> [--id <slug>]
  agentsam-cad-creator bim list
  agentsam-cad-creator bim verify
  agentsam-cad-creator bim refresh <id>
  agentsam-cad-creator doctor [--json]
  agentsam-cad-creator setup [--install] [--docker] [--no-prompt] [--json]
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
  Optionally pass --install for native tools or --docker for the isolated\n  CAD service (explicit approval required).

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
      dev: 'npm run prepare:runtime && npm run dev -w @inneranimalmedia/agentsam-cad-backend',
      build: 'npm run prepare:runtime && npm run build -w @inneranimalmedia/agentsam-cad-frontend && npm run build -w @inneranimalmedia/agentsam-cad-backend',
      'prepare:runtime': 'node scripts/prepare-cad-runtime.mjs',
      start: 'npm run start -w @inneranimalmedia/agentsam-cad-backend',
      preview: 'npm run preview -w @inneranimalmedia/agentsam-cad-frontend',
      typecheck: 'npm run typecheck --workspaces --if-present',
      test: 'npm run test --workspaces --if-present',
      'bim:import': 'node bin/agentsam-cad-creator.mjs bim import',
      'bim:list': 'node bin/agentsam-cad-creator.mjs bim list',
      clean: 'rm -rf frontend/dist backend/dist coverage',
      'cf:dry-run': 'npm run build && wrangler deploy -c backend/wrangler.jsonc --dry-run'
    },
    devDependencies: {
      wrangler: '4.147.0'
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
    'bin/agentsam-cad-creator.mjs',
    'bin/cad-discovery.mjs',
    'bin/freecad-bim-preview.py',
    '.env.example',
    'README.md',
    'agentsam.app.json',
    '.agentsam/app.json',
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
    'backend/runtime',
    'scripts/prepare-cad-runtime.mjs',
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

  const server = path.join(packageRoot, 'backend', 'dist', 'server.mjs');
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
  const server = path.join(packageRoot, 'backend', 'dist', 'server.mjs');
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
    const daemon = await probeDockerDaemon();
    const service = await probeDockerServiceHealth();
    console.log('  Docker daemon: ' + (daemon.available ? 'ready' : daemon.reason || 'unavailable'));
    console.log('  CAD Docker service: ' + (service.available ? 'online' : 'not running'));
    console.log('  To choose a container route, run "agentsam-cad-creator setup --docker".');
    console.log('  Doctor never starts containers automatically.');
  } else {
    console.log('');
    console.log('All local CAD engines are operational.');
  }
}

async function runSetup(args = []) {
  const isJson = args.includes('--json');
  const doInstall = args.includes('--install');
  const requestDocker = args.includes('--docker');
  const noPrompt = args.includes('--no-prompt');
  const configPath = getCadConfigPath();

  if (!isJson) console.log('Probing machine for CAD engines across PATH and standard OS locations...');
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

  const openscad = cadReport.tools.find(t => t.tool === 'openscad');
  const dockerService = await probeDockerServiceHealth();
  const dockerDaemon = await probeDockerDaemon();
  if (!isJson && openscad && !openscad.available && !dockerService.available) {
    console.log('Docker daemon: ' + (dockerDaemon.available ? 'ready' : dockerDaemon.reason || 'unavailable'));
    console.log('Docker recovery is opt-in: "agentsam-cad-creator setup --docker".');
  }

  let approvedDocker = requestDocker;
  if (!approvedDocker && !noPrompt && process.stdin.isTTY && process.stdout.isTTY &&
      openscad && !openscad.available && dockerDaemon.available && !dockerService.available) {
    const { createInterface } = await import('node:readline/promises');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await prompt.question('OpenSCAD missing. Start a localhost-only Docker CAD service? [y/N] ');
      approvedDocker = /^y(es)?$/i.test(answer.trim());
    } finally {
      prompt.close();
    }
  }

  if (approvedDocker && !dockerService.available) {
    if (!dockerDaemon.available) {
      console.error('Docker is not available: start Docker Desktop/daemon first, then retry --docker.');
      process.exitCode = 1;
      return;
    }
    const sdkCli = path.resolve(packageRoot, '../../src/cli.js');
    if (!fs.existsSync(sdkCli)) {
      console.error('Standalone CAD package cannot launch SDK dockerize automatically. Run "agentsam dockerize cad --tools openscad" in the installed AgentSam SDK.');
      process.exitCode = 1;
      return;
    }
    // Docker creation only occurs after explicit --docker or affirmative TTY reply.
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, [sdkCli, 'dockerize', 'cad', '--tools', 'openscad'], {
      cwd: packageRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error || result.status !== 0) {
      console.error('Docker CAD service could not be started; local CAD engines remain unchanged.');
      process.exitCode = 1;
      return;
    }
    const confirmed = await probeDockerServiceHealth();
    if (!confirmed.available || !confirmed.tools?.openscad?.installed) {
      console.error('Docker started but OpenSCAD execution health could not be verified.');
      process.exitCode = 1;
      return;
    }
    console.log('Docker OpenSCAD service verified. Retry the CAD operation.');
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

function bimLibraryRoot() {
  return path.resolve(process.env.AGENTSAM_CAD_BIM_LIBRARY || path.join(os.homedir(), '.agentsam/cad/bim-starters'));
}

function runBim(args) {
  const [action, value] = args;
  const root = bimLibraryRoot();
  if (action === 'list') {
    const entries = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : [];
    const starters = entries.filter(entry => entry.isDirectory()).flatMap(entry => {
      const file = path.join(root, entry.name, 'manifest.json');
      if (!fs.existsSync(file)) return [];
      const { id, title, objectCount, meshCount, sourceSha256 } = JSON.parse(fs.readFileSync(file, 'utf8'));
      return [{ id, title, objectCount, meshCount, sourceSha256 }];
    });
    console.log(JSON.stringify({ library: root, starters }, null, 2));
    return;
  }
  if (action === 'verify') {
    const entries = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : [];
    const results = entries.filter((entry) => entry.isDirectory()).map((entry) => {
      const dir = path.join(root, entry.name);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const source = fs.readFileSync(path.join(dir, 'source.FCStd'));
      const sha = createHash('sha256').update(source).digest('hex');
      if (sha !== manifest.sourceSha256) throw new Error('Source integrity mismatch: ' + entry.name);
      const data = fs.readFileSync(path.join(dir, 'preview.glb'));
      if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length)
        throw new Error('Invalid GLB header: ' + entry.name);
      const jsonSize = data.readUInt32LE(12);
      if (data.toString('ascii', 16, 20) !== 'JSON' || jsonSize < 16)
        throw new Error('Invalid GLB JSON chunk: ' + entry.name);
      const gltf = JSON.parse(data.toString('utf8', 20, 20 + jsonSize));
      if (manifest.previewSha256 && createHash('sha256').update(data).digest('hex') !== manifest.previewSha256)
        throw new Error('Preview digest mismatch: ' + entry.name);
      if (gltf.meshes.length !== manifest.meshCount || gltf.scenes[0].nodes.length !== manifest.meshCount)
        throw new Error('GLB mesh count mismatch: ' + entry.name);
      if (gltf.materials.length !== manifest.materialCount)
        throw new Error('GLB materials mismatch: ' + entry.name);
      const thumbnail = fs.readFileSync(path.join(dir, 'thumbnail.png'));
      if (thumbnail.toString('hex', 0, 8) !== '89504e470d0a1a0a')
        throw new Error('Invalid original thumbnail: ' + entry.name);
      return { id: manifest.id, verified: true, objects: manifest.objectCount, meshes: manifest.meshCount,
        materials: manifest.materialCount, sourceSha256: sha };
    });
    console.log(JSON.stringify({ library: root, verified: results.length, starters: results }, null, 2));
    return;
  }
  if (!['import', 'refresh'].includes(action)) throw new Error('Expected: bim import <file.FCStd> [--id slug], bim list, or bim refresh <id>');
  if (!value) throw new Error('BIM source file or starter ID required');
  const source = action === 'import' ? path.resolve(value) : path.join(root, value, 'working.FCStd');
  if (!fs.existsSync(source)) throw new Error('Native FreeCAD file not found: ' + source);
  if (!source.toLowerCase().endsWith('.fcstd')) throw new Error('Only FreeCAD .FCStd source files are accepted');
  const suggested = action === 'import' ? path.basename(source, path.extname(source)) : value;
  const id = (valueAfter('--id', args) || suggested).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw new Error('Invalid BIM starter ID');
  const directory = path.join(root, id);
  if (action === 'refresh' && path.resolve(source) !== path.resolve(directory, 'working.FCStd')) throw new Error('Invalid refresh path');
  const python = process.env.AGENTSAM_CAD_FREECAD_PYTHON || (process.platform === 'darwin'
    ? '/Applications/FreeCAD.app/Contents/Resources/bin/python' : '');
  if (!python || !fs.existsSync(python)) throw new Error('FreeCAD Python unavailable. Connect/discover FreeCAD before importing; no conversion was attempted.');
  const converter = path.join(packageRoot, 'bin/freecad-bim-preview.py');
  if (!fs.existsSync(converter)) throw new Error('Packaged BIM converter missing');
  const result = spawnSync(python, [converter, source, directory, ...(action === 'refresh' ? ['--working'] : [])], {
    stdio: 'inherit', timeout: 120000, env: process.env,
  });
  if (result.error || result.status !== 0) throw new Error('FreeCAD BIM conversion failed; inspect output above and preserve the original .FCStd');
}

const args = process.argv.slice(2);
const first = args[0];
const command = first === '--help' || first === '-h' ? 'help' : first && !first.startsWith('-') ? first : 'preview';

try {
  if (command === 'preview') {
    await preview(command === args[0] ? args.slice(1) : args);
  } else if (command === 'bim') {
    runBim(args.slice(1));
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
