import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getCapability, getCapabilityManifest, listCapabilities, projectRepositorySnapshot, repositorySnapshot } from '../capabilities/index.js';
import { getAddon, listAddons, listPresets } from '../presets/index.js';
import { projectConfigPath, readProjectConfig, setDeployTarget, setProductPreset, writeProjectConfig } from '../lib/project-config.js';

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
  let view = 'index';
  let viewExplicit = false;
  let limit = 50;
  let facetLimit = 48;
  let pretty = false;
  let snapshotFile = '';
  let saveSnapshot = '';
  const filters = {};
  const addFilter = (field, value) => {
    const clean = String(value || '').trim();
    if (!clean) throw new Error(`inspect_${field}_value_required`);
    (filters[field] ||= []).push(clean);
  };
  const filterFlags = new Map([
    ['--system', 'system'], ['--package', 'package'], ['--category', 'category'], ['--layer', 'layer'],
    ['--kind', 'kind'], ['--language', 'language'], ['--role', 'role'], ['--execution-domain', 'execution_domain'], ['--tag', 'tag'],
    ['--path', 'path'], ['--symbol', 'symbol'], ['--import', 'import'], ['--match', 'match'],
  ]);
  for (let i = 0; i < opts.positionals.length; i += 1) {
    const arg = opts.positionals[i];
    if (arg === '--churn-days') churnDays = Number(opts.positionals[++i] || 30);
    else if (arg === '--view') { view = String(opts.positionals[++i] || '').trim().toLowerCase(); viewExplicit = true; }
    else if (arg === '--limit') limit = Number(opts.positionals[++i] || 50);
    else if (arg === '--facet-limit') facetLimit = Number(opts.positionals[++i] || 48);
    else if (arg === '--pretty') pretty = true;
    else if (arg === '--full') { view = 'full'; viewExplicit = true; }
    else if (arg === '--index') { view = 'index'; viewExplicit = true; }
    else if (arg === '--snapshot-file') snapshotFile = String(opts.positionals[++i] || '').trim();
    else if (arg === '--save-snapshot') saveSnapshot = String(opts.positionals[++i] || '').trim();
    else if (filterFlags.has(arg)) addFilter(filterFlags.get(arg), opts.positionals[++i]);
    else if (arg === 'repository') continue;
    else throw new Error(`unknown inspect option: ${arg}`);
  }
  if (!['full', 'index', 'files'].includes(view)) throw new Error(`invalid inspect view: ${view}`);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('inspect limit must be an integer from 1..500');
  if (!Number.isInteger(facetLimit) || facetLimit < 1 || facetLimit > 200) throw new Error('inspect facet limit must be an integer from 1..200');
  if (Object.keys(filters).length && !viewExplicit) view = 'files';
  else if (Object.keys(filters).length && view === 'full') view = 'files';
  if (argv.includes('--snapshot-file') && !snapshotFile) throw new Error('inspect_snapshot_file_value_required');
  if (argv.includes('--save-snapshot') && !saveSnapshot) throw new Error('inspect_save_snapshot_value_required');

  const result = snapshotFile
    ? JSON.parse(fs.readFileSync(path.resolve(opts.cwd, snapshotFile), 'utf8'))
    : await repositorySnapshot({ cwd: opts.cwd, churnDays });
  if (!result || result.capability !== 'repository.snapshot' || !result.snapshot_id || !result.tree) {
    throw new Error('inspect_snapshot_file_invalid');
  }
  if (saveSnapshot) {
    const filename = path.resolve(opts.cwd, saveSnapshot);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `${JSON.stringify(result)}\n`, 'utf8');
  }
  const output = view === 'full' ? result : projectRepositorySnapshot(result, { view, filters, limit, facetLimit });
  if (opts.json) process.stdout.write(`${JSON.stringify(output, null, pretty ? 2 : 0)}\n`);
  else if (view !== 'full') {
    console.log(`\nRepository snapshot ${result.snapshot_id} · ${view}`);
    console.log(`  repo       ${result.repository.full_name || result.repository.repository_id || '(local)'}`);
    console.log(`  revision   ${result.repository.revision_sha}`);
    console.log(`  merkle     ${result.tree.merkle_root}`);
    console.log(`  metadata   ${result.tree.metadata_root}`);
    console.log(`  matched    ${output.projection.matched}${output.projection.truncated ? ` (showing ${output.projection.returned})` : ''}`);
    const systems = output.facets.systems.slice(0, 12).map((row) => `${row.value}:${row.count}`).join(', ');
    if (systems) console.log(`  systems    ${systems}`);
    const trust = output.analysis?.trust_boundary;
    if (trust) {
      console.log(`  trust      ${trust.status}${trust.finding_count ? ` · ${trust.finding_count} contradiction${trust.finding_count === 1 ? '' : 's'}` : ''}`);
      for (const finding of trust.findings || []) {
        console.log(`    ! ${finding.kind}: ${finding.source}${finding.target ? ` → ${finding.target}` : finding.specifier ? ` · ${finding.specifier}` : finding.env ? ` · ${finding.env}` : ''}`);
        if (finding.repair_action) console.log(`      repair: ${finding.repair_action}`);
      }
      if (trust.findings_truncated) console.log(`    … ${trust.finding_count - trust.findings_returned} more contradiction(s); use --view full --json for full evidence`);
    }
    if (view === 'files') for (const file of output.files) console.log(`  ${file.path}  [${file.system || '-'} / ${file.category || '-'} / ${file.execution_domain || 'unknown'}]`);
    console.log('');
  } else {
    console.log(`\nRepository snapshot ${result.snapshot_id}`);
    console.log(`  repo       ${result.repository.full_name || result.repository.repository_id || '(local)'}`);
    console.log(`  revision   ${result.repository.revision_sha}`);
    console.log(`  merkle     ${result.tree.merkle_root}`);
    console.log(`  metadata   ${result.tree.metadata_root}`);
    console.log(`  files      ${result.intelligence.summary?.file_count ?? result.tree.stats?.files ?? 'unknown'}`);
    console.log(`  knowledge  ${result.knowledge?.indexed ? result.knowledge.generation_id : result.knowledge?.configured ? 'configured / not indexed' : 'not configured'}`);
    const trust = result.analysis?.trust_boundary;
    if (trust) console.log(`  trust      ${trust.status}${trust.findings?.length ? ` · ${trust.findings.length} contradiction${trust.findings.length === 1 ? '' : 's'}` : ''}`);
    console.log(`  deploy     ${result.deploy?.status || 'no trusted receipt'}`);
    console.log(`  content    ${result.content_hash}\n`);
  }
  return output;
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

function featureStatePath(cwd) { return path.join(cwd, '.agentsam', 'features.json'); }

function parseAddArgs(argv = []) {
  const opts = parseCommon(argv);
  opts.provider = '';
  opts.schemaProfile = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--provider') opts.provider = argv[++i] || '';
    else if (arg === '--schema' || arg === '--schema-profile') opts.schemaProfile = argv[++i] || '';
  }
  return opts;
}

export function applyPresetSelection(cwd, preset) {
  const filename = projectConfigPath(cwd);
  if (!fs.existsSync(filename)) throw new Error('not_agentsam_project');
  const config = readProjectConfig(cwd);
  setProductPreset(config, preset);
  writeProjectConfig(cwd, config);
  return config;
}

export async function runAdd(argv = []) {
  const opts = parseAddArgs(argv);
  const id = opts.positionals[0];
  if (!id || id === '--help') {
    const rows = listAddons();
    console.log(`agentsam add <${rows.map(x => x.id).join('|')}> [--cwd PATH] [--provider <id>] [--schema <profile>] [--json]`);
    return null;
  }
  const addon = getAddon(id);
  if (!addon) throw new Error(`unknown_addon:${id}`);
  const cwd = path.resolve(opts.cwd);
  if (!fs.existsSync(projectConfigPath(cwd))) throw new Error('not_agentsam_project');

  const { writeFeatureSelections } = await import('../lib/features-resolve.js');
  let state = { schema_version: 2, features: {} };
  if (fs.existsSync(featureStatePath(cwd))) {
    state = JSON.parse(fs.readFileSync(featureStatePath(cwd), 'utf8'));
    state.schema_version = 2;
    state.features ||= {};
  }

  /** @type {Record<string, unknown>} */
  const entry = {
    selected: true,
    capabilities: addon.capabilities,
    selected_at: new Date().toISOString(),
  };
  if (addon.id === 'auth') {
    const { normalizeProviderTemplateId } = await import('../lib/features-resolve.js');
    entry.provider_template = normalizeProviderTemplateId(opts.provider) || 'inneranimalmedia';
    if (opts.schemaProfile) entry.schema_profile = opts.schemaProfile;
  }
  state.features[addon.id] = entry;

  const written = writeFeatureSelections(cwd, state);
  if (addon.id === 'deploy-cloudflare') {
    const config = readProjectConfig(cwd);
    setDeployTarget(config, 'cloudflare');
    writeProjectConfig(cwd, config);
  }
  const result = {
    ok: true,
    feature: addon.id,
    capabilities: addon.capabilities,
    description: addon.description,
    state_file: '.agentsam/features.json',
    resolved_file: 'generated/.agentsam/features-resolved.json',
    provider_template: entry.provider_template || null,
    schema_profile: entry.schema_profile || null,
    resources: written.snapshot?.features?.[addon.id]?.resources || null,
  };
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    console.log(`\nAdded ${addon.id}\n  ${addon.description}\n  state: ${result.state_file}`);
    if (entry.provider_template) console.log(`  provider: ${entry.provider_template}`);
    console.log(`  resolved: ${result.resolved_file}\n`);
  }
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
