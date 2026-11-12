import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleStudioLivingPlan } from './studio-living-plan.js';

export function createLivingPlanFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY,status TEXT DEFAULT 'active');
    INSERT INTO accounts(id) VALUES('au_owner'),('au_other');
    CREATE TABLE code_repositories (id TEXT PRIMARY KEY,account_id TEXT,name TEXT,is_active INTEGER);
    INSERT INTO code_repositories VALUES ('github:owner/repo','au_owner','Repo',1);
    CREATE TABLE agentsam_workspace_state(id TEXT PRIMARY KEY,repository_id TEXT,current_task_id TEXT);
    CREATE TABLE agentsam_ticket_events (
      id TEXT PRIMARY KEY, ticket_id TEXT, event_type TEXT, from_status TEXT, to_status TEXT,
      detail TEXT, actor_type TEXT, created_at INTEGER
    );
    CREATE TABLE user_goals (
      id TEXT PRIMARY KEY, goal_saved REAL DEFAULT 0, goal_paid_off REAL DEFAULT 0,
      goal_owed REAL DEFAULT 0, goal_monthly_payment REAL DEFAULT 0,
      goal_target_label TEXT, updated_at INTEGER DEFAULT(unixepoch()),
      user_id TEXT, person_uuid TEXT, goal_type TEXT DEFAULT 'personal',
      title TEXT, description TEXT, priority INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active', target_date INTEGER, completed_at INTEGER,
      workspace_id TEXT, tenant_id TEXT, metadata_json TEXT DEFAULT '{}');
    CREATE TABLE agentsam_tickets (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, project TEXT,
      subsystem TEXT, priority TEXT, updated_at INTEGER, account_id TEXT,
      repository_id TEXT, description TEXT, status_reason TEXT, source TEXT DEFAULT 'manual',
      linked_commit TEXT, created_at INTEGER, closed_at INTEGER
    );
    INSERT INTO agentsam_tickets (id,title,status,project,subsystem,priority,updated_at,account_id) VALUES
      ('ticket_owned','Implement checkout','active','commerce','web','P1',12,'au_owner'),
      ('ticket_other','Private work','active','other','internal','P1',13,'au_other');
  `);
  for (const filename of [
    '../migrations/1356_user_living_plan_goals.sql',
    '../migrations/1357_user_goal_ticket_links.sql',
  ]) sqlite.exec(readFileSync(new URL(filename, import.meta.url), 'utf8'));

  function statement(sql, params = []) {
    return {
      bind(...args) { return statement(sql, args); },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async run() {
        const result = sqlite.prepare(sql).run(...params);
        return { meta: { changes: Number(result.changes) } };
      },
    };
  }
  const DB = {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const query of statements) results.push(await query.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  async function call(path, method = 'GET', body, accountId = 'au_owner', origin) {
    const request = new Request('https://example.test' + path, {
      method, ...(body ? { headers: { 'content-type':'application/json', ...(origin ? {origin} : {}) },
        body: JSON.stringify(body) } : {}),
    });
    const response = await handleStudioLivingPlan(request, { DB }, accountId);
    return { status: response.status, data: await response.json() };
  }
  return { call, sqlite, DB };
}
