import assert from 'node:assert/strict';
import test from 'node:test';
import { createSqliteD1 } from './work-sqlite-d1.js';
import { handleWorkData, listTickets, createTicket, updateTicket, ticketAnalytics } from './work-data.js';

const ME = 'au_test_owner';
const OTHER = 'au_someone_else';

async function call(db, owner, method, path, body) {
  const request = new Request('https://x.test' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } });
  const res = await handleWorkData(request, db, owner);
  return { status: res.status, json: await res.json() };
}

test('fresh install self-bootstraps the schema and starts empty', async () => {
  const db = createSqliteD1();
  const t = await call(db, ME, 'GET', '/api/tickets');
  assert.equal(t.status, 200);
  assert.deepEqual(t.json.tickets, []);
  assert.deepEqual((await call(db, ME, 'GET', '/api/projects')).json.projects, []);
  assert.deepEqual((await call(db, ME, 'GET', '/api/calendar/events')).json.events, []);
});

test('tickets: full CRUD, shipped sets closed_at, owner isolation', async () => {
  const db = createSqliteD1();
  const created = await call(db, ME, 'POST', '/api/tickets', { title: 'Ship it', surface: 'dashboard', priority: 'P0', dueAt: '2026-10-20T12:00:00Z', estimatedMinutes: 90 });
  assert.equal(created.status, 201);
  const id = created.json.ticket.id;
  assert.equal(created.json.ticket.surface, 'dashboard');
  assert.equal(created.json.ticket.dueAt, '2026-10-20T12:00:00.000Z');

  const patched = await call(db, ME, 'PATCH', `/api/tickets/${id}`, { status: 'shipped' });
  assert.equal(patched.json.ticket.status, 'shipped');
  assert.ok(patched.json.ticket.closedAt, 'closed_at set so the shipped trigger passes');
  assert.equal(patched.json.ticket.percentComplete, 100);
  const reopened = await call(db, ME, 'PATCH', `/api/tickets/${id}`, { status: 'active' });
  assert.equal(reopened.json.ticket.closedAt, null);

  assert.equal((await call(db, OTHER, 'GET', `/api/tickets/${id}`)).status, 404);
  assert.equal((await call(db, OTHER, 'DELETE', `/api/tickets/${id}`)).status, 404);
  assert.equal((await call(db, OTHER, 'GET', '/api/tickets')).json.tickets.length, 0);

  assert.equal((await call(db, ME, 'DELETE', `/api/tickets/${id}`)).status, 200);
  assert.equal((await call(db, ME, 'GET', `/api/tickets/${id}`)).status, 404);
});

test('tickets: insert directly as shipped works (closed_at populated)', async () => {
  const db = createSqliteD1();
  const t = await createTicket(db, ME, { title: 'done', status: 'shipped' });
  assert.equal(t.status, 'shipped');
  assert.ok(t.closedAt);
  const a = ticketAnalytics(await listTickets(db, ME));
  assert.equal(a.completionRate, 100);
});

test('projects: create, derive counts from tickets, update meta, archive, hard delete, owner isolation', async () => {
  const db = createSqliteD1();
  const p = await call(db, ME, 'POST', '/api/projects', { name: 'Acme Site', projectType: 'landing-page', status: 'development', objective: 'Launch', githubRepo: 'acme/site' });
  assert.equal(p.status, 201);
  const pid = p.json.project.id;
  assert.equal(p.json.project.status, 'development');
  assert.equal(p.json.project.objective, 'Launch');
  await createTicket(db, ME, { title: 'a', project: pid, status: 'shipped' });
  await createTicket(db, ME, { title: 'b', project: 'Acme Site', status: 'active' });
  const list = (await call(db, ME, 'GET', '/api/projects')).json.projects;
  assert.equal(list[0].openTasks, 1);
  assert.equal(list[0].progress, 50);

  const upd = await call(db, ME, 'PATCH', `/api/projects/${pid}`, { name: 'Acme Web', progress: 80, starred: true, objective: '' });
  assert.equal(upd.json.project.name, 'Acme Web');
  assert.equal(upd.json.project.progress, 80);
  assert.equal(upd.json.project.starred, true);
  assert.equal(upd.json.project.objective, null);

  assert.equal((await call(db, OTHER, 'PATCH', `/api/projects/${pid}`, { name: 'x' })).status, 404);
  assert.equal((await call(db, OTHER, 'GET', '/api/projects')).json.projects.length, 0);

  const archived = await call(db, ME, 'DELETE', `/api/projects/${pid}`);
  assert.equal(archived.json.archived, true);
  assert.equal((await call(db, ME, 'GET', `/api/projects/${pid}`)).json.project.status, 'archived');
  const hard = await call(db, ME, 'DELETE', `/api/projects/${pid}?hard=1`);
  assert.equal(hard.json.deleted, true);
  assert.equal((await call(db, ME, 'GET', `/api/projects/${pid}`)).status, 404);
  assert.equal((await call(db, ME, 'POST', '/api/projects', {})).status, 400);
});

test('calendar: create, range query, move, delete, validation, owner isolation, project unlink', async () => {
  const db = createSqliteD1();
  const proj = (await call(db, ME, 'POST', '/api/projects', { name: 'P' })).json.project;
  const c = await call(db, ME, 'POST', '/api/calendar/events', { title: 'Call', start: '2026-10-15T15:00:00Z', end: '2026-10-15T16:00:00Z', type: 'client_call', projectId: proj.id });
  assert.equal(c.status, 201);
  assert.equal(c.json.event.start, '2026-10-15T15:00:00.000Z');
  const id = c.json.event.id;

  const inRange = await call(db, ME, 'GET', '/api/calendar/events?from=2026-10-12T00:00:00Z&to=2026-10-19T00:00:00Z');
  assert.equal(inRange.json.events.length, 1);
  const outRange = await call(db, ME, 'GET', '/api/calendar/events?from=2026-11-01T00:00:00Z&to=2026-11-08T00:00:00Z');
  assert.equal(outRange.json.events.length, 0);

  const moved = await call(db, ME, 'PATCH', `/api/calendar/events/${id}`, { start: '2026-10-16T15:00:00Z', end: '2026-10-16T16:30:00Z', title: 'Call 2' });
  assert.equal(moved.json.event.end, '2026-10-16T16:30:00.000Z');
  assert.equal((await call(db, ME, 'PATCH', `/api/calendar/events/${id}`, { start: '2026-10-17T10:00:00Z', end: '2026-10-17T09:00:00Z' })).status, 400);
  assert.equal((await call(db, ME, 'POST', '/api/calendar/events', { start: '2026-10-15T15:00:00Z' })).status, 400);
  assert.equal((await call(db, OTHER, 'DELETE', `/api/calendar/events/${id}`)).status, 404);

  await call(db, ME, 'DELETE', `/api/projects/${proj.id}?hard=1`);
  const after = (await call(db, ME, 'GET', '/api/calendar/events?from=2026-10-12T00:00:00Z&to=2026-10-30T00:00:00Z')).json.events;
  assert.equal(after[0].projectId, null);
  assert.equal((await call(db, ME, 'DELETE', `/api/calendar/events/${id}`)).status, 200);
});

test('synced (non-primary) events are read-only', async () => {
  const db = createSqliteD1();
  await call(db, ME, 'GET', '/api/calendar/events');
  db.exec(`INSERT INTO calendar_events (id, tenant_id, user_id, title, start_datetime, end_datetime, calendar_source) VALUES ('gce_1','t','${ME}','HTGR','2026-10-15 23:30:00','2026-10-16 00:30:00','google_calendar')`);
  const list = (await call(db, ME, 'GET', '/api/calendar/events?from=2026-10-15T00:00:00Z&to=2026-10-17T00:00:00Z')).json.events;
  assert.equal(list[0].readOnly, true);
  assert.equal((await call(db, ME, 'PATCH', '/api/calendar/events/gce_1', { title: 'x' })).status, 409);
});

test('unauthenticated and unknown routes', async () => {
  const db = createSqliteD1();
  assert.equal((await call(db, '', 'GET', '/api/tickets')).status, 401);
  const res = await handleWorkData(new Request('https://x.test/api/other'), db, ME);
  assert.equal(res, null);
});
