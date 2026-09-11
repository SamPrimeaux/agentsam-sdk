import fs from 'node:fs';
import path from 'node:path';
import { initializeLocalSqlite, inspectLocalSqlite } from '../local/sqlite.js';
import { getLocalDatabasePath, getLocalSchemaPath, readProjectConfig } from '../lib/project-config.js';

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

function resolveDb(root, config) {
  return {
    dbPath: path.resolve(root, getLocalDatabasePath(config)),
    schemaPath: path.resolve(root, getLocalSchemaPath(config)),
  };
}

export async function runDb(argv = [], opts = {}) {
  const sub = argv[0] || 'status';
  if (!['init', 'status'].includes(sub)) {
    throw new Error(`unknown db command: ${sub}`);
  }

  const root = findProjectRoot(opts.cwd || process.cwd());
  const config = readProjectConfig(root);
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
