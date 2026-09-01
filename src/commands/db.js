import fs from 'node:fs';
import path from 'node:path';
import { initializeLocalSqlite, inspectLocalSqlite } from '../local/sqlite.js';

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.agentsam', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Not an Agent Sam project — run `agentsam init` first.');
}

function readConfig(root) {
  return JSON.parse(fs.readFileSync(path.join(root, '.agentsam', 'config.json'), 'utf8'));
}

function resolveDb(root, config) {
  return {
    dbPath: path.resolve(root, config.db_path || '.agentsam/data/agentsam.sqlite'),
    schemaPath: path.resolve(root, config.db_schema || 'db/schema.sql'),
  };
}

export async function runDb(argv = [], opts = {}) {
  const sub = argv[0] || 'status';
  if (!['init', 'status'].includes(sub)) {
    throw new Error(`unknown db command: ${sub}`);
  }

  const root = findProjectRoot(opts.cwd || process.cwd());
  const config = readConfig(root);
  const paths = resolveDb(root, config);

  if (sub === 'init') {
    const result = await initializeLocalSqlite(paths);
    console.log(`\n  Agent Sam local DB\n`);
    console.log(`  ✓ SQLite      ${result.dbPath}`);
    console.log(`  ✓ Tables      ${result.tables.length}`);
    console.log(`  ✓ Schema      ${paths.schemaPath}\n`);
    return result;
  }

  const result = await inspectLocalSqlite(paths.dbPath);
  console.log(`\n  Agent Sam local DB\n`);
  if (!result.exists) {
    console.log(`  status        not initialized`);
    console.log(`  path          ${result.dbPath}`);
    console.log(`\n  Run: agentsam db init\n`);
    return result;
  }
  console.log(`  status        ready`);
  console.log(`  path          ${result.dbPath}`);
  console.log(`  size          ${result.sizeBytes} bytes`);
  console.log(`  tables        ${result.tables.join(', ') || '(none)'}`);
  console.log('');
  return result;
}
