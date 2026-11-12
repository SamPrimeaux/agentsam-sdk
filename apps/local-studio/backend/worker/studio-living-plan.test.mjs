import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleStudioLivingPlan } from './studio-living-plan.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    INSERT INTO accounts VALUES('au_owner'),('au_other');
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
      subsystem TEXT, priority TEXT, updated_at INTEGER, account_id TEXT
    );
    INSERT INTO agentsam_tickets VALUES
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
  return { call, sqlite };
}

test('requires a signed-in account; never falls back to tenant or workspace', async () => {
  const { call } = fixture();
  const result = await call('/api/studio/living-plan', 'GET', undefined, null);
  assert.equal(result.status, 401);
});

test('private goals and steps are account scoped, with auditable completion', async () => {
  const { call, sqlite } = fixture();
  const created = await call('/api/studio/living-plan/goals', 'POST',
    { title:'Ship reliable checkout', goal_type:'platform' });
  assert.equal(created.status, 201);
  const goalId = created.data.id;
  const step = await call('/api/studio/living-plan/goals/' + goalId + '/steps',
    'POST', { title:'Verify clean install' });
  assert.equal(step.status, 201);
  const other = await call('/api/studio/living-plan', 'GET', undefined, 'au_other');
  assert.equal(other.data.goals.length, 0);
  assert.equal(other.data.steps.length, 0);
  const denied = await call('/api/studio/living-plan/steps/' + step.data.id,
    'PATCH', { status:'done' }, 'au_other');
  assert.equal(denied.status, 404);
  const changed = await call('/api/studio/living-plan/steps/' + step.data.id,
    'PATCH', { status:'done', note:'Passed on mobile', evidence_ref:'ticket_owned' });
  assert.equal(changed.status, 200);
  assert.equal(sqlite.prepare('SELECT status FROM user_goal_steps WHERE id=?')
    .get(step.data.id).status, 'done');
  assert.equal(sqlite.prepare('SELECT action FROM user_goal_activity WHERE step_id=?')
    .get(step.data.id).action, 'done');
  const done = await call('/api/studio/living-plan/goals/' + goalId,
    'PATCH', {status:'completed'});
  assert.equal(done.status, 200);
});

test('ticket relationships use existing tickets and reject cross-account links', async () => {
  const { call, sqlite } = fixture();
  const goalId = (await call('/api/studio/living-plan/goals','POST',
    {title:'Launch platform',goal_type:'platform'})).data.id;
  const list = await call('/api/studio/living-plan/tickets?q=checkout');
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.tickets.map(t=>t.id), ['ticket_owned']);
  const denied = await call('/api/studio/living-plan/goals/' + goalId + '/tickets',
    'POST', { ticket_id:'ticket_other' });
  assert.equal(denied.status, 404);
  const linked = await call('/api/studio/living-plan/goals/' + goalId + '/tickets',
    'POST', { ticket_id:'ticket_owned' });
  assert.equal(linked.status, 200);
  const snapshot = await call('/api/studio/living-plan');
  assert.equal(snapshot.data.ticketLinks[0].ticket_id, 'ticket_owned');
  assert.equal(snapshot.data.ticketLinks[0].status, 'active');
  const other = await call('/api/studio/living-plan', 'GET', undefined, 'au_other');
  assert.equal(other.data.ticketLinks.length, 0);
  const unlinked = await call('/api/studio/living-plan/goals/' + goalId + '/tickets/ticket_owned', 'DELETE');
  assert.equal(unlinked.status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user_goal_ticket_links').get().n, 0);
});

test('rejects cross-origin writes and invalid statuses', async () => {
  const { call } = fixture();
  const bad = await call('/api/studio/living-plan/goals', 'POST',
    { title:'Unsafe' }, 'au_owner', 'https://attacker.example');
  assert.equal(bad.status, 403);
  const goalId = (await call('/api/studio/living-plan/goals', 'POST',
    { title:'Bounded status' })).data.id;
  const invalid = await call('/api/studio/living-plan/goals/' + goalId, 'PATCH', {status:'shipped'});
  assert.equal(invalid.status, 400);
});
