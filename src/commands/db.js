import { discoverProjectStores, selectKnowledgeStore } from '../knowledge/store-discovery.js';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalSqliteDatabase, initializeLocalSqlite, inspectLocalSqlite } from '../local/sqlite.js';
import { applyRuntimeMigrations } from '../local/migrations.js';
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
  if (sub === 'sources' || sub === 'select') {
    if (sub === 'select' && (argv[1] !== 'knowledge' || !argv[2] || argv.length > 4)) throw new Error('Usage: /db select knowledge sqlite|postgres [CONNECTION_ENV]');
    const result = sub === 'sources' ? await discoverProjectStores(opts.cwd || process.cwd()) : selectKnowledgeStore(opts.cwd || process.cwd(), argv[2], argv[3]);
    (opts.write || console.log)(JSON.stringify(result, null, 2) + '\n');
    return result;
  }
  if (!['init', 'migrate', 'status'].includes(sub)) {
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
    console.log(`  ✓ Schema      ${paths.schemaPath}`);
    console.log('  ✓ Migrations  current\n');
    return result;
  }

  if (sub === 'migrate') {
    if (!fs.existsSync(paths.dbPath)) throw new Error('Local DB is not initialized — run `agentsam db init` first.');
    const db = await createLocalSqliteDatabase(paths.dbPath);
    try {
      const result = await applyRuntimeMigrations(db);
      console.log(`\n  Agent Sam local DB migrations\n`);
      console.log(`  applied       ${result.applied}`);
      console.log(`  known         ${result.total}`);
      console.log(`  path          ${paths.dbPath}\n`);
      return result;
    } finally {
      db.close();
    }
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
