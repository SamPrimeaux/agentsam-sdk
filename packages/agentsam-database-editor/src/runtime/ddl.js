/**
 * Provider-aware structured DDL — create / alter / drop / indexes.
 * Builds single-statement SQL; execution goes through the adapter.
 */

import {
  assertSafeIdent,
  buildCreateTableSql,
  normalizeType,
  normalizeDefault,
} from '../ui/create-table-sql.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeEngine(engine) {
  return String(engine || 'sqlite').toLowerCase().includes('postgres')
    ? 'postgres'
    : 'sqlite';
}

function quoteIdent(name, engine = 'sqlite') {
  const safe = assertSafeIdent(name, 'identifier');
  return `"${safe.replace(/"/g, '""')}"`;
}

function qualifyTable(tableName, schema, engine) {
  const table = assertSafeIdent(tableName, 'table');
  const schemaName = schema ? assertSafeIdent(schema, 'schema') : null;
  return {
    tableName: table,
    schema: schemaName,
    qualified: schemaName
      ? `${quoteIdent(schemaName, engine)}.${quoteIdent(table, engine)}`
      : quoteIdent(table, engine),
  };
}

/**
 * @typedef {'create_table'|'drop_table'|'alter_table_add_column'|'create_index'|'drop_index'} DdlAction
 */

export const DDL_ACTIONS = Object.freeze([
  'create_table',
  'drop_table',
  'alter_table_add_column',
  'create_index',
  'drop_index',
  'rename_column',
  'drop_column',
  'alter_column_type',
  'alter_column_nullability',
  'alter_column_default',
  'add_foreign_key',
]);

/**
 * Build DDL SQL without executing.
 *
 * @param {{
 *   action: DdlAction | string,
 *   engine?: string,
 *   table_name?: string,
 *   tableName?: string,
 *   name?: string,
 *   schema?: string,
 *   columns?: unknown[],
 *   column?: { name: string, type?: string, nullable?: boolean, defaultValue?: string|null },
 *   index_name?: string,
 *   indexName?: string,
 *   index_columns?: string[],
 *   unique?: boolean,
 *   if_exists?: boolean,
 *   if_not_exists?: boolean,
 * }} input
 */
export function buildDdlSql(input = {}) {
  const action = clean(input.action || 'create_table').toLowerCase();
  const engine = normalizeEngine(input.engine);

  if (action === 'create_table') {
    return {
      action,
      ...buildCreateTableSql({
        tableName: input.table_name || input.tableName || input.name,
        schema: input.schema,
        columns: input.columns,
        engine,
      }),
    };
  }

  if (action === 'drop_table') {
    const { tableName, schema, qualified } = qualifyTable(
      input.table_name || input.tableName || input.name,
      input.schema,
      engine,
    );
    const ifExists = input.if_exists !== false;
    return {
      action,
      sql: `DROP TABLE ${ifExists ? 'IF EXISTS ' : ''}${qualified};`,
      tableName,
      schema,
      engine,
    };
  }

  if (action === 'alter_table_add_column') {
    const { tableName, schema, qualified } = qualifyTable(
      input.table_name || input.tableName || input.name,
      input.schema,
      engine,
    );
    const column = input.column && typeof input.column === 'object' ? input.column : null;
    if (!column?.name) {
      const err = new Error('column_required');
      err.code = 'column_required';
      throw err;
    }
    const colName = assertSafeIdent(column.name, 'column');
    const type = normalizeType(column.type, engine);
    const parts = [`${quoteIdent(colName, engine)} ${type}`];
    if (column.nullable === false) parts.push('NOT NULL');
    if (column.defaultValue != null && column.defaultValue !== '') {
      const raw = String(column.defaultValue).trim();
      if (/^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(raw) || /^-?\d+(\.\d+)?$/.test(raw)) {
        parts.push(`DEFAULT ${raw.toUpperCase?.() && /^(NULL|CURRENT_)/i.test(raw) ? raw.toUpperCase() : raw}`);
      } else {
        parts.push(`DEFAULT '${raw.replace(/'/g, "''")}'`);
      }
    }
    return {
      action,
      sql: `ALTER TABLE ${qualified} ADD COLUMN ${parts.join(' ')};`,
      tableName,
      schema,
      engine,
      columnName: colName,
    };
  }

  if (["rename_column", "drop_column", "alter_column_type", "alter_column_nullability", "alter_column_default", "add_foreign_key"].includes(action)) {
    const { tableName, schema, qualified } = qualifyTable(input.table_name, input.schema, engine);
    const column = quoteIdent(input.column_name, engine);
    let clause;
    if (action === "rename_column") clause = "RENAME COLUMN " + column + " TO " + quoteIdent(input.new_name, engine);
    else if (action === "drop_column") clause = "DROP COLUMN " + column;
    else {
      if (engine !== "postgres") throw new Error("sqlite_constraint_changes_require_table_rebuild");
      if (action === "alter_column_type") clause = "ALTER COLUMN " + column + " TYPE " + normalizeType(input.column_type, engine);
      if (action === "alter_column_nullability") clause = "ALTER COLUMN " + column + (input.nullable === false ? " SET NOT NULL" : " DROP NOT NULL");
      if (action === "alter_column_default") {
        const value = normalizeDefault(input.default_value, input.column_type || "TEXT");
        clause = "ALTER COLUMN " + column + (value == null ? " DROP DEFAULT" : " SET DEFAULT " + value);
      }
      if (action === "add_foreign_key") {
        const reference = qualifyTable(input.ref_table, input.ref_schema, engine);
        clause = "ADD CONSTRAINT " + quoteIdent(input.constraint_name, engine) + " FOREIGN KEY (" + column + ") REFERENCES " + reference.qualified + " (" + quoteIdent(input.ref_column, engine) + ")";
      }
    }
    return { action, sql: "ALTER TABLE " + qualified + " " + clause + ";", tableName, schema, engine };
  }

  if (action === 'create_index') {
    const { tableName, schema, qualified } = qualifyTable(
      input.table_name || input.tableName || input.name,
      input.schema,
      engine,
    );
    const indexName = assertSafeIdent(input.index_name || input.indexName, 'index');
    const cols = Array.isArray(input.index_columns) ? input.index_columns : [];
    if (!cols.length) {
      const err = new Error('index_columns_required');
      err.code = 'index_columns_required';
      throw err;
    }
    const colSql = cols.map((c) => quoteIdent(c, engine)).join(', ');
    const unique = input.unique === true ? 'UNIQUE ' : '';
    const ifNotExists = input.if_not_exists !== false ? 'IF NOT EXISTS ' : '';
    return {
      action,
      sql: `CREATE ${unique}INDEX ${ifNotExists}${quoteIdent(indexName, engine)} ON ${qualified} (${colSql});`,
      tableName,
      schema,
      engine,
      indexName,
    };
  }

  if (action === 'drop_index') {
    const indexName = assertSafeIdent(input.index_name || input.indexName, 'index');
    const ifExists = input.if_exists !== false;
    let sql;
    if (engine === 'postgres' && input.schema) {
      const schemaName = assertSafeIdent(input.schema, 'schema');
      sql = `DROP INDEX ${ifExists ? 'IF EXISTS ' : ''}${quoteIdent(schemaName, engine)}.${quoteIdent(indexName, engine)};`;
    } else {
      sql = `DROP INDEX ${ifExists ? 'IF EXISTS ' : ''}${quoteIdent(indexName, engine)};`;
    }
    return {
      action,
      sql,
      schema: input.schema ? assertSafeIdent(input.schema, 'schema') : null,
      engine,
      indexName,
    };
  }

  const err = new Error('ddl_action_unsupported');
  err.code = 'ddl_action_unsupported';
  err.status = 400;
  throw err;
}

/**
 * Build + optionally execute structured DDL through an adapter.
 *
 * @param {import('../contracts/adapter.js').DatabaseAdapter} adapter
 * @param {object} input
 * @param {{ previewOnly?: boolean, studio_approved?: boolean, destructive_confirmed?: boolean, assertSqlAllowed?: Function }} [opts]
 */
export async function applyDdl(adapter, input, opts = {}) {
  const engine = input.engine || adapter.dialect || 'sqlite';
  const built = buildDdlSql({ ...input, engine });
  if (opts.previewOnly === true) {
    return { ok: true, preview: true, ...built };
  }
  const assertAllowed = opts.assertSqlAllowed;
  if (typeof assertAllowed === 'function') {
    assertAllowed(
      { writable: true },
      built.sql,
      {
        studio_approved: opts.studio_approved === true,
        destructive_confirmed: opts.destructive_confirmed === true,
      },
    );
  }
  const result = await adapter.query({ sql: built.sql, params: [] });
  return { ok: true, preview: false, ...built, result };
}

export { buildCreateTableSql, assertSafeIdent };
