import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getCapability, getCapabilityManifest, listCapabilities, repositorySnapshot } from '../capabilities/index.js';
import { getAddon, listAddons, listPresets } from '../presets/index.js';

function parseCommon(argv = []) {
  const out = { json: false, cwd: process.cwd(), positionals: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--cwd') out.cwd = argv[++i] || out.cwd;
    else out.positionals.push(arg);
  }
  return out;
}

export async function runInspect(argv = []) {
  const opts = parseCommon(argv);
  let churnDays = 30;
  for (let i = 0; i < opts.positionals.length; i += 1) {
    if (opts.positionals[i] === '--churn-days') churnDays = Number(opts.positionals[++i] || 30);
    else if (opts.positionals[i] === 'repository') continue;
    else throw new Error(`unknown inspect option: ${opts.positionals[i]}`);
  }
  const result = await repositorySnapshot({ cwd: opts.cwd, churnDays });
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    console.log(`\nRepository snapshot ${result.snapshot_id}`);
    console.log(`  repo       ${result.repository.full_name || result.repository.repository_id || '(local)'}`);
    console.log(`  revision   ${result.repository.revision_sha}`);
    console.log(`  merkle     ${result.tree.merkle_root}`);
    console.log(`  files      ${result.intelligence.summary?.file_count ?? result.tree.stats?.files ?? 'unknown'}`);
    console.log(`  knowledge  ${result.knowledge?.indexed ? result.knowledge.generation_id : result.knowledge?.configured ? 'configured / not indexed' : 'not configured'}`);
    console.log(`  deploy     ${result.deploy?.status || 'no trusted receipt'}`);
    console.log(`  content    ${result.content_hash}\n`);
  }
  return result;
}

export async function runCapabilities(argv = []) {
  const opts = parseCommon(argv);
  const id = opts.positionals[0] || '';
  const result = id ? getCapability(id) : getCapabilityManifest();
  if (id && !result) throw new Error(`unknown_capability:${id}`);
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (id) console.log(`${result.id}\n  ${result.description}\n  cli: ${result.cli || '(library only)'}\n  model required: ${result.model_required ? 'yes' : 'no'}`);
  else {
    console.log('\nAgentSam deterministic capabilities\n');
    for (const row of listCapabilities()) console.log(`  ${row.id.padEnd(26)} ${row.description}`);
    console.log('');
  }
  return result;
}

function projectConfigPath(cwd) { return path.join(cwd, '.agentsam', 'config.json'); }
function featureStatePath(cwd) { return path.join(cwd, '.agentsam', 'features.json'); }

export function applyPresetSelection(cwd, preset) {
  const filename = projectConfigPath(cwd);
  if (!fs.existsSync(filename)) throw new Error('not_agentsam_project');
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const next = { ...config, preset: preset.id, features: [...preset.features], capabilities: [...preset.capabilities] };
  fs.writeFileSync(filename, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function runAdd(argv = []) {
  const opts = parseCommon(argv);
  const id = opts.positionals[0];
  if (!id || id === '--help') {
    const rows = listAddons();
    console.log(`agentsam add <${rows.map(x => x.id).join('|')}> [--cwd PATH] [--json]`);
    return null;
  }
  const addon = getAddon(id);
  if (!addon) throw new Error(`unknown_addon:${id}`);
  const cwd = path.resolve(opts.cwd);
  if (!fs.existsSync(projectConfigPath(cwd))) throw new Error('not_agentsam_project');
  fs.mkdirSync(path.dirname(featureStatePath(cwd)), { recursive: true });
  let state = { schema_version: 1, features: {} };
  if (fs.existsSync(featureStatePath(cwd))) state = JSON.parse(fs.readFileSync(featureStatePath(cwd), 'utf8'));
  state.features ||= {};
  state.features[addon.id] = { selected: true, capabilities: addon.capabilities, selected_at: new Date().toISOString() };
  fs.writeFileSync(featureStatePath(cwd), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  if (addon.id === 'deploy-cloudflare') {
    const config = JSON.parse(fs.readFileSync(projectConfigPath(cwd), 'utf8'));
    config.deploy_target = 'cloudflare';
    fs.writeFileSync(projectConfigPath(cwd), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
  const result = { ok: true, feature: addon.id, capabilities: addon.capabilities, description: addon.description, state_file: '.agentsam/features.json' };
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else console.log(`\nAdded ${addon.id}\n  ${addon.description}\n  state: ${result.state_file}\n`);
  return result;
}

export async function runDev(argv = []) {
  const opts = parseCommon(argv);
  if (opts.positionals.length) throw new Error(`unknown dev option: ${opts.positionals[0]}`);
  const cwd = path.resolve(opts.cwd);
  const pkgFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgFile)) throw new Error('package_json_not_found');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (!pkg.scripts?.dev) throw new Error('dev_script_not_found');
  if (/\bagentsam\s+dev\b/.test(pkg.scripts.dev)) throw new Error('recursive_agentsam_dev_script');
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], { cwd, stdio: 'inherit', env: process.env });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) return reject(new Error(`dev_process_signal:${signal}`));
      process.exitCode = code || 0;
      resolve(code || 0);
    });
  });
}

export function printProductCatalog() {
  return { presets: listPresets(), addons: listAddons(), capabilities: listCapabilities() };
}
