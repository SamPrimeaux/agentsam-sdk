/**
 * Generic PostgreSQL adapter. The host owns the actual pg/Supabase/Hyperdrive
 * client and injects query(sql, params), keeping runtime credentials out of the package.
 */

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function quoteIdent(value) {
  const name = clean(value);
  if (!name) throw new Error('identifier_required');
  return `"${name.replace(/"/g, '""')}"`;
}

function normalizePgResult(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const columns = Array.isArray(result?.fields) && result.fields.length
    ? result.fields.map((field) => String(field.name))
    : rows[0] && typeof rows[0] === 'object'
      ? Object.keys(rows[0])
      : [];
  return {
    rows,
    columns,
    rowCount: Number(result?.rowCount ?? rows.length) || 0,
  };
}

export function createPostgresAdapter(options = {}) {
  if (typeof options.query !== 'function') throw new Error('postgres_query_function_required');
  const query = options.query;
  const id = clean(options.id) || 'postgres';
  const label = clean(options.label) || id;
  const provider = clean(options.provider) || 'postgres';
  const defaultSchema = clean(options.defaultSchema) || 'public';
  const writable = options.writable !== false;

  return {
    id,
    label,
    provider,
    dialect: 'postgres',
    capabilities() {
      return {
        schemaIntrospection: true,
        sqlQuery: true,
        rowMutations: writable,
        export: true,
        transactions: true,
        multiStatement: true,
        migrationApply: writable ? 'statement' : 'none',
      };
    },

    async introspect() {
      return {
        connectionId: id,
        engine: 'postgres',
        tables: await this.listTables(),
      };
    },

    async listTables() {
      const result = await query(
        `SELECT table_schema AS schema, table_name AS name, table_type AS kind
           FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog','information_schema')
          ORDER BY table_schema, table_name`,
        [],
      );
      return normalizePgResult(result).rows.map((row) => ({
        name: String(row.name),
        schema: String(row.schema || defaultSchema),
        kind: String(row.kind || 'BASE TABLE').toLowerCase(),
      }));
    },

    async describeTable(name, opts = {}) {
      const selected = typeof name === 'object' ? name : { name, ...opts };
      const table = clean(selected.name);
      const schema = clean(selected.schema) || defaultSchema;
      if (!table) throw new Error('table_required');
      const [columnsResult, indexesResult, fkResult] = await Promise.all([
        query(
          `SELECT ordinal_position, column_name AS name, data_type AS type,
                  is_nullable = 'YES' AS nullable, column_default,
                  EXISTS (
                    SELECT 1
                      FROM information_schema.table_constraints tc
                      JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                       AND tc.table_schema = kcu.table_schema
                     WHERE tc.constraint_type = 'PRIMARY KEY'
                       AND tc.table_schema = c.table_schema
                       AND tc.table_name = c.table_name
                       AND kcu.column_name = c.column_name
                  ) AS primary_key
             FROM information_schema.columns c
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position`,
          [schema, table],
        ),
        query(
          `SELECT indexname AS name, indexdef AS sql
             FROM pg_indexes
            WHERE schemaname = $1 AND tablename = $2
            ORDER BY indexname`,
          [schema, table],
        ),
        query(
          `SELECT tc.constraint_name AS name,
                  kcu.column_name AS source_column,
                  ccu.table_schema AS target_schema,
                  ccu.table_name AS target_table,
                  ccu.column_name AS target_column
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = $1
              AND tc.table_name = $2`,
          [schema, table],
        ),
      ]);
      return {
        name: table,
        schema,
        columns: normalizePgResult(columnsResult).rows.map((column) => ({
          name: String(column.name),
          type: String(column.type || ''),
          nullable: Boolean(column.nullable),
          primaryKey: Boolean(column.primary_key),
          defaultValue: column.column_default == null ? undefined : String(column.column_default),
        })),
        indexes: normalizePgResult(indexesResult).rows.map((index) => ({
          name: String(index.name),
          columns: [],
          sql: index.sql || null,
        })),
        foreignKeys: normalizePgResult(fkResult).rows.map((fk) => ({
          name: String(fk.name),
          columns: [String(fk.source_column)],
          refTable: String(fk.target_table),
          refColumns: [String(fk.target_column)],
          refSchema: String(fk.target_schema || defaultSchema),
        })),
      };
    },

    async query(input = {}) {
      const sql = clean(input.sql);
      if (!sql) throw new Error('sql_required');
      const started = Date.now();
      const result = await query(sql, Array.isArray(input.params) ? input.params : []);
      const normalized = normalizePgResult(result);
      return {
        columns: normalized.columns,
        rows: normalized.rows.map((row) => normalized.columns.map((column) => row[column])),
        objects: normalized.rows,
        rowCount: normalized.rowCount,
        durationMs: Date.now() - started,
        changes: /^\s*(insert|update|delete)\b/i.test(sql) ? normalized.rowCount : 0,
      };
    },

    async insert(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const schema = clean(input.schema) || defaultSchema;
      const table = clean(input.table);
      const values = input.values && typeof input.values === 'object' ? input.values : {};
      const keys = Object.keys(values);
      if (!table || !keys.length) throw new Error('insert_requires_table_and_values');
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
      const sql =
        `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${keys.map(quoteIdent).join(', ')}) ` +
        `VALUES (${placeholders}) RETURNING *`;
      const result = await query(sql, keys.map((key) => values[key]));
      const normalized = normalizePgResult(result);
      return { changes: normalized.rowCount, row: normalized.rows[0] || null };
    },

    async update(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const schema = clean(input.schema) || defaultSchema;
      const table = clean(input.table);
      const values = input.values && typeof input.values === 'object' ? input.values : {};
      const where = input.where && typeof input.where === 'object' ? input.where : {};
      const setKeys = Object.keys(values);
      const whereKeys = Object.keys(where);
      if (!table || !setKeys.length || !whereKeys.length) throw new Error('update_requires_table_values_where');
      let parameter = 1;
      const setSql = setKeys.map((key) => `${quoteIdent(key)} = $${parameter++}`).join(', ');
      const whereSql = whereKeys.map((key) => `${quoteIdent(key)} = $${parameter++}`).join(' AND ');
      const result = await query(
        `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setSql} WHERE ${whereSql} RETURNING *`,
        [...setKeys.map((key) => values[key]), ...whereKeys.map((key) => where[key])],
      );
      const normalized = normalizePgResult(result);
      return { changes: normalized.rowCount, rows: normalized.rows };
    },

    async delete(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const schema = clean(input.schema) || defaultSchema;
      const table = clean(input.table);
      const where = input.where && typeof input.where === 'object' ? input.where : {};
      const whereKeys = Object.keys(where);
      if (!table || !whereKeys.length) throw new Error('delete_requires_table_where');
      const whereSql = whereKeys.map((key, index) => `${quoteIdent(key)} = $${index + 1}`).join(' AND ');
      const result = await query(
        `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${whereSql} RETURNING *`,
        whereKeys.map((key) => where[key]),
      );
      const normalized = normalizePgResult(result);
      return { changes: normalized.rowCount, rows: normalized.rows };
    },

    async health() {
      const started = Date.now();
      try {
        await query('SELECT 1 AS ok', []);
        return { status: 'ok', detail: label, latencyMs: Date.now() - started };
      } catch (error) {
        return {
          status: 'down',
          detail: error?.message || String(error),
          latencyMs: Date.now() - started,
        };
      }
    },
  };
}

export function createHyperdriveAdapter(options = {}) {
  return createPostgresAdapter({
    ...options,
    provider: 'hyperdrive-postgres',
    label: options.label || 'Hyperdrive Postgres',
  });
}
