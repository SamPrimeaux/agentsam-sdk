/**
 * Local SQLite adapter — Node 22+ `node:sqlite` DatabaseSync.
 * Vectors optional (default none). Browser surfaces use a separate wasm path later.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * @param {{ path: string, id?: string, readOnly?: boolean }} opts
 * @returns {import('../contracts/adapter.js').DatabaseAdapter}
 */
export function createSqliteAdapter(opts) {
  const filePath = resolve(String(opts?.path || '').trim());
  if (!filePath) throw new Error('sqlite_path_required');
  const id = opts.id || `sqlite:${filePath}`;

  mkdirSync(dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath, {
    readOnly: Boolean(opts.readOnly),
  });

  /** @type {import('../contracts/adapter.js').DatabaseCapabilities} */
  const caps = {
    schemaIntrospection: true,
    sqlQuery: true,
    rowMutations: !opts.readOnly,
    export: true,
    transactions: true,
    multiStatement: false,
    migrationApply: 'statement',
  };

  return {
    id,
    dialect: 'sqlite',
    capabilities: () => caps,

    async introspect() {
      const tables = await this.listTables();
      return { connectionId: id, engine: 'sqlite', tables };
    },

    async listTables() {
      const rows = db
        .prepare(
          `SELECT name, type AS kind
           FROM sqlite_master
           WHERE type IN ('table','view')
             AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
        )
        .all();
      return rows.map((r) => ({
        name: String(r.name),
        kind: String(r.kind || 'table'),
      }));
    },

    async describeTable(name) {
      const table = String(name || '').trim();
      if (!table) throw new Error('table_required');
      const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
      const indexes = db.prepare(`PRAGMA index_list(${quoteIdent(table)})`).all();
      return {
        name: table,
        columns: cols.map((c) => ({
          name: String(c.name),
          type: String(c.type || ''),
          nullable: !c.notnull,
          primaryKey: Boolean(c.pk),
          defaultValue: c.dflt_value == null ? undefined : String(c.dflt_value),
        })),
        indexes: indexes.map((i) => ({
          name: String(i.name),
          columns: [],
          unique: Boolean(i.unique),
        })),
      };
    },

    async query(input) {
      const sql = String(input?.sql || '').trim();
      if (!sql) throw new Error('sql_required');
      const params = Array.isArray(input?.params) ? input.params : [];
      const started = Date.now();
      const stmt = db.prepare(sql);
      const isSelect = /^\s*(select|pragma|with|explain)\b/i.test(sql);
      if (isSelect) {
        const rowsObj = stmt.all(...params);
        const columns = rowsObj[0] ? Object.keys(rowsObj[0]) : [];
        const rows = rowsObj.map((row) => columns.map((c) => row[c]));
        return {
          columns,
          rows,
          rowCount: rows.length,
          durationMs: Date.now() - started,
          truncated: false,
        };
      }
      const info = stmt.run(...params);
      return {
        columns: ['changes', 'lastInsertRowid'],
        rows: [[info.changes, info.lastInsertRowid]],
        rowCount: 1,
        durationMs: Date.now() - started,
      };
    },

    async insert(input) {
      const table = String(input?.table || '').trim();
      const values = input?.values && typeof input.values === 'object' ? input.values : {};
      const keys = Object.keys(values);
      if (!table || !keys.length) throw new Error('insert_requires_table_and_values');
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT INTO ${quoteIdent(table)} (${keys.map(quoteIdent).join(', ')}) VALUES (${placeholders})`;
      const info = db.prepare(sql).run(...keys.map((k) => values[k]));
      return { changes: Number(info.changes) || 0, lastInsertId: info.lastInsertRowid };
    },

    async update(input) {
      const table = String(input?.table || '').trim();
      const values = input?.values && typeof input.values === 'object' ? input.values : {};
      const where = input?.where && typeof input.where === 'object' ? input.where : {};
      const setKeys = Object.keys(values);
      const whereKeys = Object.keys(where);
      if (!table || !setKeys.length || !whereKeys.length) {
        throw new Error('update_requires_table_values_where');
      }
      const sql = `UPDATE ${quoteIdent(table)} SET ${setKeys.map((k) => `${quoteIdent(k)} = ?`).join(', ')} WHERE ${whereKeys.map((k) => `${quoteIdent(k)} = ?`).join(' AND ')}`;
      const info = db.prepare(sql).run(...setKeys.map((k) => values[k]), ...whereKeys.map((k) => where[k]));
      return { changes: Number(info.changes) || 0 };
    },

    async delete(input) {
      const table = String(input?.table || '').trim();
      const where = input?.where && typeof input.where === 'object' ? input.where : {};
      const whereKeys = Object.keys(where);
      if (!table || !whereKeys.length) throw new Error('delete_requires_table_where');
      const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${whereKeys.map((k) => `${quoteIdent(k)} = ?`).join(' AND ')}`;
      const info = db.prepare(sql).run(...whereKeys.map((k) => where[k]));
      return { changes: Number(info.changes) || 0 };
    },

    async health() {
      try {
        db.prepare('SELECT 1').get();
        return { status: 'ok', detail: filePath };
      } catch (e) {
        return { status: 'down', detail: e?.message || String(e) };
      }
    },

    async applyMigration(sqlBatch) {
      const statements = String(sqlBatch || '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      const results = [];
      for (const sql of statements) {
        try {
          db.exec(sql);
          results.push({ sql, ok: true });
        } catch (e) {
          results.push({ sql, ok: false, error: e?.message || String(e) });
        }
      }
      return { ok: results.every((r) => r.ok), results };
    },

    /** @internal */
    close() {
      db.close();
    },
  };
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}
