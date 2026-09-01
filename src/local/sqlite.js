import fs from 'node:fs';
import path from 'node:path';

async function loadSqlite() {
  try {
    return await import('node:sqlite');
  } catch (error) {
    const wrapped = new Error(
      'Local SQLite requires Node 22.5+ (node:sqlite). Upgrade Node, then retry.',
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

function resolveFile(filePath) {
  return path.resolve(String(filePath || '.agentsam/data/agentsam.sqlite'));
}

export async function createLocalSqliteDatabase(filePath = '.agentsam/data/agentsam.sqlite') {
  const { DatabaseSync } = await loadSqlite();
  const resolved = resolveFile(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const database = new DatabaseSync(resolved);

  return {
    filePath: resolved,
    prepare(sql) {
      const statement = database.prepare(sql);
      const makeBound = (values = []) => ({
        async run() {
          return statement.run(...values);
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
      });

      return {
        bind(...values) {
          return makeBound(values);
        },
        async run() {
          return statement.run();
        },
        async first() {
          return statement.get() ?? null;
        },
        async all() {
          return { results: statement.all() };
        },
      };
    },
    exec(sql) {
      database.exec(sql);
    },
    close() {
      database.close();
    },
  };
}

export async function initializeLocalSqlite({
  dbPath = '.agentsam/data/agentsam.sqlite',
  schemaPath = 'db/schema.sql',
} = {}) {
  const resolvedDb = resolveFile(dbPath);
  const resolvedSchema = path.resolve(String(schemaPath));
  if (!fs.existsSync(resolvedSchema)) {
    throw new Error(`Local DB schema not found: ${resolvedSchema}`);
  }

  const schema = fs.readFileSync(resolvedSchema, 'utf8');
  const db = await createLocalSqliteDatabase(resolvedDb);
  try {
    db.exec(schema);
  } finally {
    db.close();
  }

  return inspectLocalSqlite(resolvedDb);
}

export async function inspectLocalSqlite(dbPath = '.agentsam/data/agentsam.sqlite') {
  const resolved = resolveFile(dbPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, exists: false, dbPath: resolved, tables: [] };
  }

  const db = await createLocalSqliteDatabase(resolved);
  try {
    const rows = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();
    const stat = fs.statSync(resolved);
    return {
      ok: true,
      exists: true,
      dbPath: resolved,
      sizeBytes: stat.size,
      tables: rows.results.map((row) => String(row.name)),
    };
  } finally {
    db.close();
  }
}
