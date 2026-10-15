/**
 * D1-compatible handle over node:sqlite for the desktop/local store and tests.
 * NOT imported by the hosted worker (node:sqlite is Node-only).
 */
import { DatabaseSync } from 'node:sqlite';

export function createSqliteD1(file = ':memory:') {
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const prepare = (sql) => {
    const make = (args) => ({
      bind: (...next) => make(next),
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      run: async () => {
        const info = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
    });
    return make([]);
  };
  return { prepare, exec: (sql) => sqlite.exec(sql), close: () => sqlite.close() };
}
