/**
 * Structured Create Table SQL builder for Database Studio.
 * Generates single-statement CREATE TABLE DDL with validated identifiers.
 */

const SQLITE_TYPES = new Set([
  'INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC', 'BOOLEAN', 'DATE', 'DATETIME',
]);

const PG_TYPES = new Set([
  'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL',
  'REAL', 'DOUBLE PRECISION', 'NUMERIC', 'BOOLEAN',
  'TEXT', 'VARCHAR', 'UUID', 'JSONB', 'JSON', 'TIMESTAMP', 'TIMESTAMPTZ', 'DATE',
]);

export function assertSafeIdent(name, label = 'identifier') {
  const value = name == null ? '' : String(name).trim();
  if (!value) {
    const err = new Error(`${label}_required`);
    err.code = `${label}_required`;
    throw err;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    const err = new Error(`${label}_invalid`);
    err.code = `${label}_invalid`;
    err.message = `${label} must match /^[A-Za-z_][A-Za-z0-9_]*$/`;
    throw err;
  }
  if (/^(sqlite_|_cf_|d1_)/i.test(value)) {
    const err = new Error(`${label}_reserved`);
    err.code = `${label}_reserved`;
    throw err;
  }
  return value;
}

function quoteIdent(name, engine = 'sqlite') {
  const safe = assertSafeIdent(name, 'identifier');
  if (engine === 'postgres') return `"${safe.replace(/"/g, '""')}"`;
  return `"${safe.replace(/"/g, '""')}"`;
}

function normalizeType(raw, engine = 'sqlite') {
  const type = String(raw || 'TEXT').trim().toUpperCase().replace(/\s+/g, ' ');
  const allowed = engine === 'postgres' ? PG_TYPES : SQLITE_TYPES;
  if (allowed.has(type)) return type;
  if (/^VARCHAR\(\d+\)$/.test(type) || /^NUMERIC\(\d+(,\d+)?\)$/.test(type)) return type;
  const err = new Error('column_type_invalid');
  err.code = 'column_type_invalid';
  err.message = `Unsupported column type: ${type}`;
  throw err;
}

function normalizeDefault(value, type) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(raw)) return raw.toUpperCase();
  if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return `'${raw.slice(1, -1).replace(/'/g, "''")}'`;
  }
  if (/TEXT|VARCHAR|UUID|JSON|DATE|TIME/i.test(type)) {
    return `'${raw.replace(/'/g, "''")}'`;
  }
  return raw;
}

/**
 * @param {{
 *   tableName: string,
 *   schema?: string,
 *   columns: Array<{
 *     name: string,
 *     type?: string,
 *     nullable?: boolean,
 *     primaryKey?: boolean,
 *     unique?: boolean,
 *     defaultValue?: string|null,
 *   }>,
 *   engine?: 'sqlite'|'postgres'|string,
 * }} input
 */
export function buildCreateTableSql(input = {}) {
  const engine = String(input.engine || 'sqlite').toLowerCase().includes('postgres')
    ? 'postgres'
    : 'sqlite';
  const tableName = assertSafeIdent(input.tableName || input.table || input.name, 'table');
  const schemaName = input.schema ? assertSafeIdent(input.schema, 'schema') : null;
  const columns = Array.isArray(input.columns) ? input.columns : [];
  if (!columns.length) {
    const err = new Error('columns_required');
    err.code = 'columns_required';
    throw err;
  }

  const seen = new Set();
  const primaryKeys = [];
  const defs = columns.map((column, index) => {
    const name = assertSafeIdent(column?.name, `column_${index + 1}`);
    const key = name.toLowerCase();
    if (seen.has(key)) {
      const err = new Error('duplicate_column');
      err.code = 'duplicate_column';
      err.message = `Duplicate column: ${name}`;
      throw err;
    }
    seen.add(key);
    const type = normalizeType(column?.type || 'TEXT', engine);
    const parts = [`${quoteIdent(name, engine)} ${type}`];
    if (column?.primaryKey) primaryKeys.push(name);
    if (column?.nullable === false && !column?.primaryKey) parts.push('NOT NULL');
    if (column?.unique && !column?.primaryKey) parts.push('UNIQUE');
    const defaultSql = normalizeDefault(column?.defaultValue ?? column?.default, type);
    if (defaultSql != null) parts.push(`DEFAULT ${defaultSql}`);
    return parts.join(' ');
  });

  if (primaryKeys.length === 1) {
    const only = primaryKeys[0].toLowerCase();
    const idx = columns.findIndex((column) => String(column.name).toLowerCase() === only);
    if (idx >= 0) {
      defs[idx] = `${defs[idx]} PRIMARY KEY`;
    }
  } else if (primaryKeys.length > 1) {
    defs.push(`PRIMARY KEY (${primaryKeys.map((name) => quoteIdent(name, engine)).join(', ')})`);
  }

  const qualified = schemaName
    ? `${quoteIdent(schemaName, engine)}.${quoteIdent(tableName, engine)}`
    : quoteIdent(tableName, engine);

  const sql = `CREATE TABLE ${qualified} (\n  ${defs.join(',\n  ')}\n);`;
  return {
    sql,
    tableName,
    schema: schemaName,
    engine,
    columnCount: columns.length,
  };
}
