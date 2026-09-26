/**
 * Cloudflare D1 adapters.
 *
 * Remote adapter uses the Cloudflare REST API with an account-scoped OAuth token.
 * Binding adapter uses a Worker D1 binding. Both expose the same DatabaseAdapter contract.
 */

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function quoteIdent(value) {
  const name = clean(value);
  if (!name) throw new Error('identifier_required');
  return `"${name.replace(/"/g, '""')}"`;
}

function rowObjects(result) {
  if (!result) return [];
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.result?.results)) return result.result.results;
  if (Array.isArray(result?.result)) {
    const first = result.result[0];
    if (Array.isArray(first?.results)) return first.results;
  }
  return [];
}

function resultMeta(result) {
  if (!result) return {};
  if (result?.meta && typeof result.meta === 'object') return result.meta;
  if (result?.result?.meta && typeof result.result.meta === 'object') return result.result.meta;
  if (Array.isArray(result?.result) && result.result[0]?.meta) return result.result[0].meta;
  return {};
}

function resultColumns(rows) {
  return rows?.[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [];
}

async function cfJson(fetchImpl, url, token, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const message =
      body?.errors?.[0]?.message ||
      body?.message ||
      `Cloudflare API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = body?.errors || null;
    throw error;
  }
  return body;
}

export function createD1Adapter(options = {}) {
  const token = clean(options.token);
  const accountId = clean(options.accountId || options.account_id);
  const databaseId = clean(options.databaseId || options.database_id);
  const id = clean(options.id) || `cloudflare-d1:${databaseId}`;
  const label = clean(options.label || options.name) || databaseId;
  const fetchImpl = options.fetchImpl || fetch;
  const writable = options.writable !== false;

  if (!token || !accountId || !databaseId) {
    throw new Error('d1_remote_adapter_requires_token_account_database');
  }

  const queryUrl =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
    `/d1/database/${encodeURIComponent(databaseId)}/query`;

  async function remoteQuery(sql, params = []) {
    return cfJson(fetchImpl, queryUrl, token, {
      method: 'POST',
      body: JSON.stringify({ sql, params }),
    });
  }

  return {
    id,
    label,
    provider: 'cloudflare-d1',
    dialect: 'sqlite',
    databaseId,
    accountId,
    capabilities() {
      return {
        schemaIntrospection: true,
        sqlQuery: true,
        rowMutations: writable,
        export: true,
        transactions: false,
        multiStatement: true,
        migrationApply: writable ? 'statement' : 'none',
      };
    },

    async introspect() {
      return {
        connectionId: id,
        engine: 'sqlite',
        tables: await this.listTables(),
      };
    },

    async listTables() {
      const result = await remoteQuery(
        `SELECT name, type AS kind
           FROM sqlite_master
          WHERE type IN ('table','view')
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE '_cf_%'
            AND name NOT LIKE 'd1_%'
          ORDER BY name COLLATE NOCASE`,
      );
      return rowObjects(result).map((row) => ({
        name: String(row.name),
        kind: String(row.kind || 'table'),
      }));
    },

    async describeTable(name) {
      const table = clean(typeof name === 'object' ? name.name : name);
      if (!table) throw new Error('table_required');
      const q = quoteIdent(table);
      const [columnsResult, indexesResult, fkResult, sqlResult] = await Promise.all([
        remoteQuery(`PRAGMA table_info(${q})`),
        remoteQuery(`PRAGMA index_list(${q})`),
        remoteQuery(`PRAGMA foreign_key_list(${q})`),
        remoteQuery(
          `SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name = ? LIMIT 1`,
          [table],
        ),
      ]);
      const indexRows = rowObjects(indexesResult);
      const indexes = [];
      for (const indexRow of indexRows) {
        const indexName = clean(indexRow.name);
        if (!indexName) continue;
        const sql = await remoteQuery(
          `SELECT name, sql FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
          [indexName],
        );
        const row = rowObjects(sql)[0] || {};
        indexes.push({
          name: indexName,
          columns: [],
          unique: Boolean(indexRow.unique),
          sql: row.sql || null,
        });
      }
      return {
        name: table,
        columns: rowObjects(columnsResult).map((column) => ({
          name: String(column.name),
          type: String(column.type || ''),
          nullable: !Boolean(column.notnull),
          primaryKey: Boolean(column.pk),
          defaultValue: column.dflt_value == null ? undefined : String(column.dflt_value),
        })),
        indexes,
        foreignKeys: rowObjects(fkResult).map((fk) => ({
          name: String(fk.id ?? ''),
          columns: [String(fk.from || '')],
          refTable: String(fk.table || ''),
          refColumns: [String(fk.to || '')],
        })),
        createSql: rowObjects(sqlResult)[0]?.sql || null,
      };
    },

    async query(input = {}) {
      const sql = clean(input.sql);
      if (!sql) throw new Error('sql_required');
      const started = Date.now();
      const result = await remoteQuery(sql, Array.isArray(input.params) ? input.params : []);
      const rowsObj = rowObjects(result);
      const columns = resultColumns(rowsObj);
      const meta = resultMeta(result);
      return {
        columns,
        rows: rowsObj.map((row) => columns.map((column) => row[column])),
        objects: rowsObj,
        rowCount: rowsObj.length,
        durationMs:
          Number(meta?.timings?.sql_duration_ms ?? meta?.duration ?? 0) ||
          Date.now() - started,
        rowsRead: Number(meta?.rows_read ?? 0) || 0,
        rowsWritten: Number(meta?.rows_written ?? 0) || 0,
        changes: Number(meta?.changes ?? 0) || 0,
        lastInsertId: meta?.last_row_id ?? null,
        sizeAfter: Number(meta?.size_after ?? 0) || null,
        meta,
      };
    },

    async insert(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const table = clean(input.table);
      const values = input.values && typeof input.values === 'object' ? input.values : {};
      const keys = Object.keys(values);
      if (!table || !keys.length) throw new Error('insert_requires_table_and_values');
      const sql =
        `INSERT INTO ${quoteIdent(table)} (${keys.map(quoteIdent).join(', ')}) ` +
        `VALUES (${keys.map(() => '?').join(', ')})`;
      const result = await this.query({ sql, params: keys.map((key) => values[key]) });
      return { changes: result.changes, lastInsertId: result.lastInsertId };
    },

    async update(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const table = clean(input.table);
      const values = input.values && typeof input.values === 'object' ? input.values : {};
      const where = input.where && typeof input.where === 'object' ? input.where : {};
      const setKeys = Object.keys(values);
      const whereKeys = Object.keys(where);
      if (!table || !setKeys.length || !whereKeys.length) {
        throw new Error('update_requires_table_values_where');
      }
      const sql =
        `UPDATE ${quoteIdent(table)} SET ` +
        setKeys.map((key) => `${quoteIdent(key)} = ?`).join(', ') +
        ` WHERE ` +
        whereKeys.map((key) => `${quoteIdent(key)} = ?`).join(' AND ');
      const result = await this.query({
        sql,
        params: [...setKeys.map((key) => values[key]), ...whereKeys.map((key) => where[key])],
      });
      return { changes: result.changes };
    },

    async delete(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const table = clean(input.table);
      const where = input.where && typeof input.where === 'object' ? input.where : {};
      const whereKeys = Object.keys(where);
      if (!table || !whereKeys.length) throw new Error('delete_requires_table_where');
      const sql =
        `DELETE FROM ${quoteIdent(table)} WHERE ` +
        whereKeys.map((key) => `${quoteIdent(key)} = ?`).join(' AND ');
      const result = await this.query({
        sql,
        params: whereKeys.map((key) => where[key]),
      });
      return { changes: result.changes };
    },

    async health() {
      try {
        await remoteQuery('SELECT 1 AS ok');
        return { status: 'ok', detail: label };
      } catch (error) {
        return { status: 'down', detail: error?.message || String(error) };
      }
    },
  };
}

export function createD1BindingAdapter(options = {}) {
  const db = options.db;
  if (!db?.prepare) throw new Error('d1_binding_required');
  const id = clean(options.id) || 'd1-binding';
  const label = clean(options.label) || id;
  const writable = options.writable !== false;

  async function execute(sql, params = [], mode = 'all') {
    const prepared = db.prepare(sql).bind(...params);
    if (mode === 'run') return prepared.run();
    return prepared.all();
  }

  const adapter = {
    id,
    label,
    provider: 'cloudflare-d1-binding',
    dialect: 'sqlite',
    capabilities() {
      return {
        schemaIntrospection: true,
        sqlQuery: true,
        rowMutations: writable,
        export: true,
        transactions: false,
        multiStatement: false,
        migrationApply: writable ? 'statement' : 'none',
      };
    },
    async introspect() {
      return { connectionId: id, engine: 'sqlite', tables: await this.listTables() };
    },
    async listTables() {
      const result = await execute(
        `SELECT name, type AS kind
           FROM sqlite_master
          WHERE type IN ('table','view')
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE '_cf_%'
          ORDER BY name COLLATE NOCASE`,
      );
      return (result?.results || []).map((row) => ({
        name: String(row.name),
        kind: String(row.kind || 'table'),
      }));
    },
    async describeTable(name) {
      const table = clean(typeof name === 'object' ? name.name : name);
      if (!table) throw new Error('table_required');
      const q = quoteIdent(table);
      const [columns, indexes, foreignKeys, createRow] = await Promise.all([
        execute(`PRAGMA table_info(${q})`),
        execute(`PRAGMA index_list(${q})`),
        execute(`PRAGMA foreign_key_list(${q})`),
        db.prepare(`SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name = ? LIMIT 1`).bind(table).first(),
      ]);
      return {
        name: table,
        columns: (columns?.results || []).map((column) => ({
          name: String(column.name),
          type: String(column.type || ''),
          nullable: !Boolean(column.notnull),
          primaryKey: Boolean(column.pk),
          defaultValue: column.dflt_value == null ? undefined : String(column.dflt_value),
        })),
        indexes: (indexes?.results || []).map((index) => ({
          name: String(index.name),
          columns: [],
          unique: Boolean(index.unique),
        })),
        foreignKeys: (foreignKeys?.results || []).map((fk) => ({
          name: String(fk.id ?? ''),
          columns: [String(fk.from || '')],
          refTable: String(fk.table || ''),
          refColumns: [String(fk.to || '')],
        })),
        createSql: createRow?.sql || null,
      };
    },
    async query(input = {}) {
      const sql = clean(input.sql);
      if (!sql) throw new Error('sql_required');
      const params = Array.isArray(input.params) ? input.params : [];
      const isRead = /^\s*(select|pragma|with|explain)\b/i.test(sql);
      const started = Date.now();
      if (isRead) {
        const result = await execute(sql, params, 'all');
        const rowsObj = result?.results || [];
        const columns = resultColumns(rowsObj);
        return {
          columns,
          rows: rowsObj.map((row) => columns.map((column) => row[column])),
          objects: rowsObj,
          rowCount: rowsObj.length,
          durationMs: Date.now() - started,
          rowsRead: Number(result?.meta?.rows_read ?? 0) || 0,
          rowsWritten: Number(result?.meta?.rows_written ?? 0) || 0,
          changes: 0,
          meta: result?.meta || {},
        };
      }
      if (!writable) throw new Error('database_read_only');
      const result = await execute(sql, params, 'run');
      return {
        columns: [],
        rows: [],
        objects: [],
        rowCount: 0,
        durationMs: Date.now() - started,
        rowsRead: Number(result?.meta?.rows_read ?? 0) || 0,
        rowsWritten: Number(result?.meta?.rows_written ?? 0) || 0,
        changes: Number(result?.meta?.changes ?? 0) || 0,
        lastInsertId: result?.meta?.last_row_id ?? null,
        sizeAfter: Number(result?.meta?.size_after ?? 0) || null,
        meta: result?.meta || {},
      };
    },
    async insert(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const values = input.values && typeof input.values === 'object' ? input.values : {};
      const keys = Object.keys(values);
      if (!input.table || !keys.length) throw new Error('insert_requires_table_and_values');
      const result = await this.query({
        sql: `INSERT INTO ${quoteIdent(input.table)} (${keys.map(quoteIdent).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        params: keys.map((key) => values[key]),
      });
      return { changes: result.changes, lastInsertId: result.lastInsertId };
    },
    async update(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const values = input.values && typeof input.values === 'object' ? input.values : {};
      const where = input.where && typeof input.where === 'object' ? input.where : {};
      const setKeys = Object.keys(values);
      const whereKeys = Object.keys(where);
      if (!input.table || !setKeys.length || !whereKeys.length) throw new Error('update_requires_table_values_where');
      const result = await this.query({
        sql: `UPDATE ${quoteIdent(input.table)} SET ${setKeys.map((key) => `${quoteIdent(key)} = ?`).join(', ')} WHERE ${whereKeys.map((key) => `${quoteIdent(key)} = ?`).join(' AND ')}`,
        params: [...setKeys.map((key) => values[key]), ...whereKeys.map((key) => where[key])],
      });
      return { changes: result.changes };
    },
    async delete(input = {}) {
      if (!writable) throw new Error('database_read_only');
      const where = input.where && typeof input.where === 'object' ? input.where : {};
      const whereKeys = Object.keys(where);
      if (!input.table || !whereKeys.length) throw new Error('delete_requires_table_where');
      const result = await this.query({
        sql: `DELETE FROM ${quoteIdent(input.table)} WHERE ${whereKeys.map((key) => `${quoteIdent(key)} = ?`).join(' AND ')}`,
        params: whereKeys.map((key) => where[key]),
      });
      return { changes: result.changes };
    },
    async health() {
      try {
        await db.prepare('SELECT 1').first();
        return { status: 'ok', detail: label };
      } catch (error) {
        return { status: 'down', detail: error?.message || String(error) };
      }
    },
  };
  return adapter;
}
