import fs from 'node:fs';
import path from 'node:path';
import { AGENTSAM_MCP_PLUGIN_MANIFEST, normalizePluginKey } from '../plugins/index.js';

const CATALOG = Object.freeze({ 'agentsam-mcp': AGENTSAM_MCP_PLUGIN_MANIFEST });
const PLUGIN_MIGRATION = '0001_agentsam_plugin_runtime.sql';

function statePath(cwd) { return path.join(path.resolve(cwd), '.agentsam', 'plugins.json'); }
function readState(cwd) {
  const filename = statePath(cwd);
  if (!fs.existsSync(filename)) return { schema_version: 1, plugins: {} };
  const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return { schema_version: 1, plugins: parsed?.plugins || {} };
}

function installMigration(cwd) {
  const source = new URL(`../../migrations/d1/${PLUGIN_MIGRATION}`, import.meta.url);
  const migrationsDir = path.join(path.resolve(cwd), 'migrations', 'd1');
  const destination = path.join(migrationsDir, PLUGIN_MIGRATION);
  fs.mkdirSync(migrationsDir, { recursive: true });
  if (!fs.existsSync(destination)) fs.copyFileSync(source, destination);
  return path.relative(path.resolve(cwd), destination);
}
function parse(argv) {
  const out = { action: argv[0] || 'list', key: '', cwd: process.cwd(), json: false };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--cwd') out.cwd = argv[++i] || out.cwd;
    else if (argv[i] === '--json') out.json = true;
    else if (!out.key) out.key = argv[i];
    else throw new Error(`unknown plugins option:${argv[i]}`);
  }
  return out;
}

export async function runPlugins(argv = []) {
  const opts = parse(argv);
  if (opts.action === 'list') {
    const state = readState(opts.cwd);
    const rows = Object.values(CATALOG).map((manifest) => ({
      plugin_key: manifest.plugin_key,
      display_name: manifest.display_name,
      description: manifest.description,
      installed: Boolean(state.plugins[manifest.plugin_key]),
      tools: manifest.tools.map((tool) => tool.tool_key),
    }));
    if (opts.json) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    else for (const row of rows) console.log(`  ${row.installed ? '✓' : '○'} @${row.plugin_key.padEnd(16)} ${row.description}`);
    return rows;
  }
  if (opts.action !== 'install' && opts.action !== 'remove') throw new Error(`unknown plugins action:${opts.action}`);
  const key = normalizePluginKey(opts.key || 'agentsam-mcp');
  const manifest = CATALOG[key];
  if (!manifest) throw new Error(`unknown_plugin:${key}`);
  const state = readState(opts.cwd);
  let migration = null;
  if (opts.action === 'install') {
    state.plugins[key] = { plugin_key: key, installed_at: new Date().toISOString(), manifest };
    migration = installMigration(opts.cwd);
  } else {
    delete state.plugins[key];
  }
  const filename = statePath(opts.cwd);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const result = { ok: true, action: opts.action, plugin_key: key, state_file: '.agentsam/plugins.json', migration };
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else console.log(`\n${opts.action === 'install' ? 'Installed' : 'Removed'} @${key}\n  state: ${result.state_file}${migration ? `\n  migration: ${migration}` : ''}\n`);
  return result;
}
