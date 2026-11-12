import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleStudioLivingPlan } from './studio-living-plan.js';
import { resolveStudioGoalsCliAccount } from './studio-goals-auth.js';
import { runGoals } from '../../../../src/commands/goals.js';
import { runGoap } from '../../../../src/commands/goap.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAccountSession } from '../../../../src/lib/account-session.js';

function fixture() {
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

test('GOAP creates and switches durable repository focus without a workspace and shares it with Goals', async () => {
  const { call, sqlite } = fixture();
  const root = '/api/studio/living-plan';
  const goap = root + '/goap?repository=github%3Aowner%2Frepo';
  const denied = await call(goap,'POST',{ action:'create',title:'Private' },'au_other');
  assert.equal(denied.status,404);
  const first = await call(goap,'POST',{ action:'create',title:'Ship checkout' });
  const second = await call(goap,'POST',{ action:'create',title:'Verify checkout' });
  assert.equal(first.status,200);
  assert.equal(second.status,200);
  const ticketId = first.data.ticketId;
  assert.equal((await call(goap)).data.currentTaskId,second.data.ticketId);
  assert.equal((await call(goap,'POST',{ action:'activate',ticketId })).status,200);
  let snapshot = await call(root);
  assert.equal(snapshot.data.goapGoals[0].id,ticketId);
  assert.equal(snapshot.data.goapGoals[0].goal_status,'active');
  assert.equal(snapshot.data.goapGoals[0].focused,true);
  assert.equal((await call(root,'GET',null,'au_other')).data.goapGoals.length,0);
  await call(goap,'POST',{ action:'close',ticketId:second.data.ticketId,status:'abandoned' });
  assert.equal((await call(goap)).data.currentTaskId,ticketId);
  assert.equal((await call(goap,'POST',{ action:'close' })).data.ticketId,ticketId);
  assert.equal((await call(goap)).data.currentTaskId,null);
  snapshot = await call(root);
  assert.equal(snapshot.data.goapGoals.find(goal=>goal.id===ticketId).goal_status,'satisfied');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM agentsam_workspace_state').get().n,0);
  assert.deepEqual(sqlite.prepare("SELECT from_status,to_status FROM agentsam_ticket_events WHERE ticket_id=? AND event_type<>'goal_released' ORDER BY rowid").all(ticketId)
    .map(row=>[row.from_status,row.to_status]),[[null,'active'],['active','active'],['active','shipped']]);
});

test('CLI account goals use the same persistence as Studio and ignore caller-supplied account identity', async () => {
  const { DB,call } = fixture();
  const home = mkdtempSync(join(tmpdir(),'agentsam-shared-goals-'));
  try {
    saveAccountSession({ access_token:'fixture-cli-session', account_id:'au_other' },{home});
    const env = { DB, IAM_OAUTH_ISSUER:'https://issuer.test' };
    const authority = async (url,init) => {
      assert.equal(url.href,'https://issuer.test/api/sdk/context');
      assert.equal(init.headers.authorization,'Bearer fixture-cli-session');
      return Response.json({auth_type:'agentsam_browser_oauth',owner_account_id:'au_owner'});
    };
    const transport = async (url,init) => {
      const request = new Request(url,init);
      const account = await resolveStudioGoalsCliAccount(request,env,authority);
      return handleStudioLivingPlan(request,env,account);
    };
    await runGoals(['set','Ship the mobile dock','--description','Verify on iPhone'],{home,fetchImpl:transport});
    const snapshot = await call('/api/studio/living-plan');
    const goal = snapshot.data.goals[0];
    assert.equal(goal.title,'Ship the mobile dock');
    assert.equal(goal.description,'Verify on iPhone');
    assert.equal((await call('/api/studio/living-plan','GET',null,'au_other')).data.goals.length,0);
    await runGoals(['status',goal.id,'paused'],{home,fetchImpl:transport});
    assert.equal((await call('/api/studio/living-plan')).data.goals[0].status,'paused');
    execFileSync('git',['init','-q',home]);
    execFileSync('git',['-C',home,'remote','add','origin','https://github.com/owner/repo.git']);
    await runGoap('new',{cwd:home,home,args:['Verify the dock'],fetchImpl:transport});
    const work = (await call('/api/studio/living-plan')).data.goapGoals[0];
    assert.equal(work.title,'Verify the dock');
    assert.equal(work.focused,true);
    await runGoals(['link',goal.id,work.id],{home,fetchImpl:transport});
    assert.equal((await call('/api/studio/living-plan')).data.ticketLinks[0].ticket_id,work.id);
    await runGoap('close',{cwd:home,home,args:['--status','blocked'],fetchImpl:transport});
    assert.equal((await call('/api/studio/living-plan')).data.goapGoals[0].goal_status,'blocked');
    assert.equal((await call('/api/studio/living-plan')).data.goapGoals[0].focused,false);
    const request = new Request('https://studio.test',{headers:{authorization:'Bearer delegated-key'}});
    assert.equal(await resolveStudioGoalsCliAccount(request,env,async()=>Response.json({
      auth_type:'agentsam_api_key',owner_account_id:'au_owner',
    })),null);
  } finally {
    rmSync(home,{recursive:true,force:true});
  }
});
