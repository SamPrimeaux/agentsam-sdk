import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingPlanFixture as fixture } from './studio-living-plan.fixture.mjs';

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
