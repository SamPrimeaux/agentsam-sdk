/**
 * Owner-scoped CRUD for Work: tickets, projects, calendar events.
 * Store-agnostic: `db` is any D1-compatible handle (hosted D1 or the local SQLite shim),
 * so the hosted worker and the desktop local store run the exact same logic.
 * Every query is scoped to `owner` (auth user id). There is no "all rows" fallback.
 */
import { ensureWorkSchema } from './work-schema.js';

export const TICKET_STATUSES = ['backlog', 'active', 'blocked', 'in_review', 'shipped', 'abandoned'];
export const PROJECT_STATUSES = ['discovery', 'design', 'development', 'qa', 'staging', 'production', 'maintenance', 'archived'];
export const PROJECT_TYPES = ['dashboard', 'landing-page', 'saas-product', 'e-commerce', 'internal-tool', 'template'];
export const EVENT_TYPES = ['meeting', 'deadline', 'reminder', 'task', 'client_call', 'personal', 'travel', 'other'];
export const EVENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
export const EVENT_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ACCENTS = ['#4f7cff', '#2f9e6b', '#d9534f', '#e08a2e', '#8b5cf6', '#0f9aa8'];

export class WorkHttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const clean = (v) => (v == null ? '' : String(v).trim());
const nowSec = () => Math.floor(Date.now() / 1000);
const rid = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
const pick = (value, allowed, fallback) => (allowed.includes(clean(value)) ? clean(value) : fallback);

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
const parseList = (value) => {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
};
const list = (value) => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []);

/** Accepts ISO string, epoch seconds/ms, Date or null → epoch seconds or null. */
function toSec(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Math.floor(value > 1e11 ? value / 1000 : value);
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
const secToIso = (sec) => (sec == null ? null : new Date(Number(sec) * 1000).toISOString());

/** Calendar rows store UTC as "YYYY-MM-DD HH:MM:SS". */
function sqlUtc(value) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? String(value) : `${String(value).replace(' ', 'T')}Z`);
  if (!Number.isFinite(ms)) throw new WorkHttpError(400, 'invalid_datetime');
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}
const sqlUtcToIso = (value) => (value ? new Date(`${String(value).replace(' ', 'T')}Z`).toISOString() : null);

/* ------------------------------ tickets ------------------------------ */

const TICKET_COLS = `id, title, description, status, status_reason, priority, project, client_id, tags,
  blocked_by, blocks, surface, parent_ticket_id, start_at, due_at, estimated_minutes, percent_complete,
  owner_kind, owner_ref, created_at, updated_at, closed_at`;

export function mapTicket(row) {
  return {
    id: clean(row.id),
    title: clean(row.title) || 'Untitled ticket',
    description: row.description != null ? String(row.description) : null,
    status: pick(row.status, TICKET_STATUSES, 'backlog'),
    statusReason: clean(row.status_reason) || null,
    priority: clean(row.priority) || null,
    project: clean(row.project) || null,
    clientId: clean(row.client_id) || null,
    tags: parseList(row.tags),
    blockedBy: parseList(row.blocked_by),
    blocks: parseList(row.blocks),
    surface: clean(row.surface) || 'platform',
    parentId: clean(row.parent_ticket_id) || null,
    startAt: secToIso(row.start_at),
    dueAt: secToIso(row.due_at),
    estimatedMinutes: row.estimated_minutes != null ? Number(row.estimated_minutes) : null,
    percentComplete: Math.max(0, Math.min(100, Number(row.percent_complete) || 0)),
    ownerKind: clean(row.owner_kind) || 'unassigned',
    ownerRef: clean(row.owner_ref) || null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || nowSec(),
    closedAt: secToIso(row.closed_at),
  };
}

export async function listTickets(db, owner) {
  await ensureWorkSchema(db);
  const res = await db
    .prepare(`SELECT ${TICKET_COLS} FROM agentsam_tickets WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1000`)
    .bind(owner)
    .all();
  return (res.results || []).map(mapTicket);
}

async function rawTicket(db, owner, id) {
  return db.prepare(`SELECT ${TICKET_COLS} FROM agentsam_tickets WHERE id = ? AND account_id = ?`).bind(id, owner).first();
}

export async function getTicket(db, owner, id) {
  await ensureWorkSchema(db);
  const row = await rawTicket(db, owner, id);
  if (!row) throw new WorkHttpError(404, 'ticket_not_found');
  return mapTicket(row);
}

async function recordTicketEvent(db, owner, ticketId, type, from, to, detail) {
  try {
    await db
      .prepare(
        `INSERT INTO agentsam_ticket_events (id, ticket_id, event_type, from_status, to_status, detail, created_at, actor_type, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?)`,
      )
      .bind(rid('tev'), ticketId, type, from, to, detail || null, nowSec(), owner)
      .run();
  } catch (err) {
    console.error('work_ticket_event_nonfatal', String(err));
  }
}

export async function createTicket(db, owner, body = {}) {
  await ensureWorkSchema(db);
  const id = rid('tkt');
  const now = nowSec();
  const status = pick(body.status, TICKET_STATUSES, 'backlog');
  await db
    .prepare(
      `INSERT INTO agentsam_tickets (id, title, description, status, priority, project, client_id, tags, blocked_by, blocks,
         surface, parent_ticket_id, start_at, due_at, estimated_minutes, percent_complete, created_at, updated_at, closed_at,
         account_id, repository_id, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'manual')`,
    )
    .bind(
      id,
      clean(body.title) || 'Untitled ticket',
      body.description != null ? String(body.description) : null,
      status,
      clean(body.priority) || null,
      clean(body.project) || null,
      clean(body.clientId) || null,
      JSON.stringify(list(body.tags)),
      JSON.stringify(list(body.blockedBy)),
      JSON.stringify(list(body.blocks)),
      clean(body.surface) || 'platform',
      clean(body.parentId) || null,
      toSec(body.startAt),
      toSec(body.dueAt),
      body.estimatedMinutes != null && body.estimatedMinutes !== '' ? Math.max(0, Math.round(Number(body.estimatedMinutes) || 0)) : null,
      status === 'shipped' ? 100 : Math.max(0, Math.min(100, Math.round(Number(body.percentComplete) || 0))),
      now,
      now,
      status === 'shipped' ? now : null,
      owner,
      clean(body.repositoryId) || 'repo_unscoped',
    )
    .run();
  await recordTicketEvent(db, owner, id, 'created', null, status);
  return getTicket(db, owner, id);
}

export async function updateTicket(db, owner, id, patch = {}) {
  await ensureWorkSchema(db);
  const existing = await rawTicket(db, owner, id);
  if (!existing) throw new WorkHttpError(404, 'ticket_not_found');
  const sets = [];
  const args = [];
  const set = (column, value) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);

  if (has('title')) set('title', clean(patch.title) || existing.title);
  if (has('description')) set('description', patch.description != null ? String(patch.description) : null);
  if (has('priority')) set('priority', clean(patch.priority) || null);
  if (has('project')) set('project', clean(patch.project) || null);
  if (has('clientId')) set('client_id', clean(patch.clientId) || null);
  if (has('surface')) set('surface', clean(patch.surface) || 'platform');
  if (has('parentId')) set('parent_ticket_id', clean(patch.parentId) || null);
  if (has('statusReason')) set('status_reason', clean(patch.statusReason) || null);
  if (has('tags')) set('tags', JSON.stringify(list(patch.tags)));
  if (has('blockedBy')) set('blocked_by', JSON.stringify(list(patch.blockedBy)));
  if (has('blocks')) set('blocks', JSON.stringify(list(patch.blocks)));
  if (has('startAt')) set('start_at', toSec(patch.startAt));
  if (has('dueAt')) set('due_at', toSec(patch.dueAt));
  if (has('estimatedMinutes')) {
    set('estimated_minutes', patch.estimatedMinutes === null || patch.estimatedMinutes === '' ? null : Math.max(0, Math.round(Number(patch.estimatedMinutes) || 0)));
  }
  if (has('percentComplete')) set('percent_complete', Math.max(0, Math.min(100, Math.round(Number(patch.percentComplete) || 0))));

  const previous = pick(existing.status, TICKET_STATUSES, 'backlog');
  let next = previous;
  if (has('status')) {
    next = pick(patch.status, TICKET_STATUSES, previous);
    set('status', next);
    if (next === 'shipped') {
      set('closed_at', existing.closed_at || nowSec());
      if (!has('percentComplete')) set('percent_complete', 100);
    } else if (previous === 'shipped') {
      set('closed_at', null);
    }
  }
  if (!sets.length) return mapTicket(existing);
  set('updated_at', nowSec());
  await db
    .prepare(`UPDATE agentsam_tickets SET ${sets.join(', ')} WHERE id = ? AND account_id = ?`)
    .bind(...args, id, owner)
    .run();
  if (next !== previous) await recordTicketEvent(db, owner, id, 'status_change', previous, next, clean(patch.statusReason));
  return getTicket(db, owner, id);
}

export async function deleteTicket(db, owner, id) {
  await ensureWorkSchema(db);
  const existing = await rawTicket(db, owner, id);
  if (!existing) throw new WorkHttpError(404, 'ticket_not_found');
  await db.prepare('DELETE FROM agentsam_tickets WHERE id = ? AND account_id = ?').bind(id, owner).run();
  try {
    await db.prepare('DELETE FROM agentsam_ticket_events WHERE ticket_id = ?').bind(id).run();
  } catch (err) {
    console.error('work_ticket_events_cleanup_nonfatal', String(err));
  }
  return { id };
}

export function ticketAnalytics(tickets) {
  if (!tickets.length) return { completionRate: 0, avgCycleDays: 0, oldestActiveDays: 0 };
  const now = nowSec();
  const shipped = tickets.filter((t) => t.status === 'shipped');
  const active = tickets.filter((t) => ['active', 'blocked', 'in_review'].includes(t.status));
  const oldestActiveDays = active.length ? Math.max(...active.map((t) => Math.max(0, Math.floor((now - t.updatedAt) / 86400)))) : 0;
  const cycles = shipped
    .map((t) => (t.closedAt && t.createdAt ? (Date.parse(t.closedAt) / 1000 - t.createdAt) / 86400 : null))
    .filter((d) => d != null && d >= 0);
  return {
    completionRate: Math.round((shipped.length / tickets.length) * 100),
    avgCycleDays: cycles.length ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10 : 0,
    oldestActiveDays,
  };
}

/* ------------------------------ projects ------------------------------ */

const initialsFrom = (name) =>
  clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'P';

export function mapProject(row, tickets = [], index = 0) {
  const meta = parseJson(row.metadata_json, {});
  const id = clean(row.id);
  const name = clean(row.name) || id;
  const mine = tickets.filter((t) => [id, name].some((k) => k && clean(t.project).toLowerCase() === k.toLowerCase()));
  const live = mine.filter((t) => t.status !== 'abandoned');
  const open = live.filter((t) => t.status !== 'shipped');
  const derived = live.length ? Math.round((live.filter((t) => t.status === 'shipped').length / live.length) * 100) : 0;
  const progress = Math.max(0, Math.min(100, Number.isFinite(Number(meta.progress)) ? Number(meta.progress) : derived));
  return {
    id,
    name,
    description: clean(row.description) || undefined,
    projectType: clean(row.project_type) || 'project',
    status: pick(row.status, PROJECT_STATUSES, 'discovery'),
    progress,
    coverImageUrl: clean(meta.cover) || null,
    initials: initialsFrom(name),
    accent: clean(meta.accent) || ACCENTS[index % ACCENTS.length],
    githubRepo: clean(meta.repo) || null,
    branch: clean(meta.branch) || null,
    objective: clean(meta.objective) || null,
    clientName: clean(row.client_name) || null,
    clientId: clean(row.client_id) || null,
    domain: clean(row.domain) || null,
    launchDate: clean(row.launch_date) || null,
    priority: Number(row.priority) || 50,
    tags: parseList(row.tags_json),
    starred: Boolean(meta.starred),
    openTasks: open.length,
    totalTasks: live.length,
    // No time ledger is joined here. Keep estimated effort distinct from
    // tracked time so the UI cannot present guesses as billed/worked hours.
    estimatedMinutes: live.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0),
    trackedMinutes: 0,
    updatedAt: row.updated_at ? new Date(`${String(row.updated_at).replace(' ', 'T')}Z`).toISOString() : null,
  };
}

export async function listProjects(db, owner, tickets = []) {
  await ensureWorkSchema(db);
  const res = await db
    .prepare(
      `SELECT * FROM projects WHERE owner_user_id = ?
       ORDER BY CASE WHEN status = 'archived' THEN 1 ELSE 0 END, updated_at DESC LIMIT 300`,
    )
    .bind(owner)
    .all();
  return (res.results || []).map((row, i) => mapProject(row, tickets, i));
}

async function rawProject(db, owner, id) {
  return db.prepare('SELECT * FROM projects WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
}

const META_KEYS = { objective: 'objective', githubRepo: 'repo', branch: 'branch', progress: 'progress', accent: 'accent', coverImageUrl: 'cover', starred: 'starred' };

export async function createProject(db, owner, body = {}) {
  await ensureWorkSchema(db);
  const name = clean(body.name);
  if (!name) throw new WorkHttpError(400, 'name_required');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'project';
  const id = `proj_${slug}_${crypto.randomUUID().slice(0, 6)}`;
  const meta = {};
  for (const [key, store] of Object.entries(META_KEYS)) if (body[key] !== undefined && body[key] !== '') meta[store] = body[key];
  const type = clean(body.projectType);
  await db
    .prepare(
      `INSERT INTO projects (id, name, client_name, project_type, status, description, owner_user_id, client_id, domain, launch_date,
         priority, tags_json, metadata_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      name,
      clean(body.clientName) || null,
      PROJECT_TYPES.includes(type) ? type : null,
      pick(body.status, PROJECT_STATUSES, 'discovery'),
      clean(body.description) || null,
      owner,
      clean(body.clientId) || null,
      clean(body.domain) || null,
      clean(body.launchDate) || null,
      Number.isFinite(Number(body.priority)) && body.priority !== undefined ? Number(body.priority) : 50,
      JSON.stringify(list(body.tags)),
      JSON.stringify(meta),
    )
    .run();
  return mapProject(await rawProject(db, owner, id), []);
}

export async function updateProject(db, owner, id, patch = {}) {
  await ensureWorkSchema(db);
  const existing = await rawProject(db, owner, id);
  if (!existing) throw new WorkHttpError(404, 'project_not_found');
  const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
  const sets = [];
  const args = [];
  const set = (column, value) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  if (has('name')) set('name', clean(patch.name) || existing.name);
  if (has('description')) set('description', clean(patch.description) || null);
  if (has('clientName')) set('client_name', clean(patch.clientName) || null);
  if (has('clientId')) set('client_id', clean(patch.clientId) || null);
  if (has('domain')) set('domain', clean(patch.domain) || null);
  if (has('launchDate')) set('launch_date', clean(patch.launchDate) || null);
  if (has('priority')) set('priority', Number.isFinite(Number(patch.priority)) ? Number(patch.priority) : 50);
  if (has('status')) set('status', pick(patch.status, PROJECT_STATUSES, existing.status));
  if (has('projectType')) set('project_type', PROJECT_TYPES.includes(clean(patch.projectType)) ? clean(patch.projectType) : null);
  if (has('tags')) set('tags_json', JSON.stringify(list(patch.tags)));
  const touchesMeta = Object.keys(META_KEYS).some(has);
  if (touchesMeta) {
    const meta = parseJson(existing.metadata_json, {});
    for (const [key, store] of Object.entries(META_KEYS)) {
      if (!has(key)) continue;
      if (patch[key] === null || patch[key] === '') delete meta[store];
      else meta[store] = patch[key];
    }
    set('metadata_json', JSON.stringify(meta));
  }
  if (sets.length) {
    set('updated_at', new Date().toISOString().slice(0, 19).replace('T', ' '));
    await db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND owner_user_id = ?`).bind(...args, id, owner).run();
  }
  return mapProject(await rawProject(db, owner, id), []);
}

/** Default = archive (reversible). `hard` removes the row; linked events keep working (project_id cleared). */
export async function deleteProject(db, owner, id, { hard = false } = {}) {
  await ensureWorkSchema(db);
  const existing = await rawProject(db, owner, id);
  if (!existing) throw new WorkHttpError(404, 'project_not_found');
  if (!hard) {
    await updateProject(db, owner, id, { status: 'archived' });
    return { id, archived: true };
  }
  await db.prepare('UPDATE calendar_events SET project_id = NULL WHERE project_id = ? AND user_id = ?').bind(id, owner).run();
  await db.prepare('DELETE FROM projects WHERE id = ? AND owner_user_id = ?').bind(id, owner).run();
  return { id, deleted: true };
}

/* ------------------------------ calendar ------------------------------ */

export function mapEvent(row) {
  return {
    id: clean(row.id),
    title: clean(row.title) || 'Untitled',
    description: clean(row.description) || null,
    location: clean(row.location) || null,
    type: pick(row.event_type, EVENT_TYPES, 'meeting'),
    start: sqlUtcToIso(row.start_datetime),
    end: sqlUtcToIso(row.end_datetime),
    allDay: Boolean(row.all_day),
    status: pick(row.status, EVENT_STATUSES, 'scheduled'),
    // The stored column default is a fixed blue; surface it as "no color" so the UI uses the host accent.
    color: clean(row.color) && clean(row.color).toLowerCase() !== '#3b82f6' ? clean(row.color) : null,
    priority: pick(row.priority, EVENT_PRIORITIES, 'normal'),
    projectId: clean(row.project_id) || null,
    clientId: clean(row.client_id) || null,
    source: clean(row.calendar_source) || 'primary',
    readOnly: (clean(row.calendar_source) || 'primary') !== 'primary',
  };
}

export async function listEvents(db, owner, { from, to } = {}) {
  await ensureWorkSchema(db);
  const start = sqlUtc(from || new Date(Date.now() - 31 * 86400000));
  const end = sqlUtc(to || new Date(Date.now() + 62 * 86400000));
  const res = await db
    .prepare(
      `SELECT * FROM calendar_events WHERE user_id = ? AND start_datetime < ? AND end_datetime >= ?
       ORDER BY start_datetime ASC LIMIT 2000`,
    )
    .bind(owner, end, start)
    .all();
  return (res.results || []).map(mapEvent);
}

async function rawEvent(db, owner, id) {
  return db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user_id = ?').bind(id, owner).first();
}

export async function createEvent(db, owner, body = {}) {
  await ensureWorkSchema(db);
  const title = clean(body.title);
  if (!title) throw new WorkHttpError(400, 'title_required');
  if (!body.start) throw new WorkHttpError(400, 'start_required');
  const start = sqlUtc(body.start);
  const end = sqlUtc(body.end || new Date(Date.parse(`${start.replace(' ', 'T')}Z`) + 3600000));
  if (end < start) throw new WorkHttpError(400, 'end_before_start');
  const id = rid('evt');
  await db
    .prepare(
      `INSERT INTO calendar_events (id, tenant_id, user_id, title, description, location, event_type, start_datetime, end_datetime,
         timezone, all_day, status, color, priority, client_id, project_id, created_by, calendar_source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'primary')`,
    )
    .bind(
      id,
      owner,
      owner,
      title,
      clean(body.description) || null,
      clean(body.location) || null,
      pick(body.type, EVENT_TYPES, 'meeting'),
      start,
      end,
      clean(body.timezone) || 'UTC',
      body.allDay ? 1 : 0,
      pick(body.status, EVENT_STATUSES, 'scheduled'),
      clean(body.color) || null,
      pick(body.priority, EVENT_PRIORITIES, 'normal'),
      clean(body.clientId) || null,
      clean(body.projectId) || null,
      owner,
    )
    .run();
  return mapEvent(await rawEvent(db, owner, id));
}

export async function updateEvent(db, owner, id, patch = {}) {
  await ensureWorkSchema(db);
  const existing = await rawEvent(db, owner, id);
  if (!existing) throw new WorkHttpError(404, 'event_not_found');
  if ((clean(existing.calendar_source) || 'primary') !== 'primary') throw new WorkHttpError(409, 'external_event_read_only');
  const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
  const sets = [];
  const args = [];
  const set = (column, value) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  if (has('title')) set('title', clean(patch.title) || existing.title);
  if (has('description')) set('description', clean(patch.description) || null);
  if (has('location')) set('location', clean(patch.location) || null);
  if (has('type')) set('event_type', pick(patch.type, EVENT_TYPES, existing.event_type));
  if (has('status')) set('status', pick(patch.status, EVENT_STATUSES, existing.status));
  if (has('priority')) set('priority', pick(patch.priority, EVENT_PRIORITIES, existing.priority));
  if (has('color')) set('color', clean(patch.color) || existing.color);
  if (has('allDay')) set('all_day', patch.allDay ? 1 : 0);
  if (has('projectId')) set('project_id', clean(patch.projectId) || null);
  if (has('clientId')) set('client_id', clean(patch.clientId) || null);
  const start = has('start') ? sqlUtc(patch.start) : existing.start_datetime;
  const end = has('end') ? sqlUtc(patch.end) : existing.end_datetime;
  if (end < start) throw new WorkHttpError(400, 'end_before_start');
  if (has('start')) set('start_datetime', start);
  if (has('end')) set('end_datetime', end);
  if (sets.length) {
    set('updated_at', new Date().toISOString().slice(0, 19).replace('T', ' '));
    await db.prepare(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...args, id, owner).run();
  }
  return mapEvent(await rawEvent(db, owner, id));
}

export async function deleteEvent(db, owner, id) {
  await ensureWorkSchema(db);
  const existing = await rawEvent(db, owner, id);
  if (!existing) throw new WorkHttpError(404, 'event_not_found');
  await db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').bind(id, owner).run();
  return { id };
}

/* ------------------------------ routing ------------------------------ */

const WORK_DATA_PATHS = [
  /^\/api\/tickets(\/[^/]+)?$/,
  /^\/api\/projects(\/[^/]+)?$/,
  /^\/api\/calendar\/events(\/[^/]+)?$/,
];
export const isWorkDataRequest = (pathname) => WORK_DATA_PATHS.some((re) => re.test(pathname));

const respond = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Returns a Response, or null when the path is not a Work data route. */
export async function handleWorkData(request, db, owner, url = new URL(request.url)) {
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const [, , resource, ...rest] = path.split('/');
  const id = rest[0] ? decodeURIComponent(rest[0]) : '';
  const calendarId = resource === 'calendar' ? decodeURIComponent(path.split('/')[4] || '') : '';
  if (!isWorkDataRequest(path)) return null;
  if (!owner) return respond({ ok: false, error: 'unauthorized' }, 401);
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await request.json().catch(() => ({})) : {};
  try {
    if (resource === 'tickets') {
      if (!id && method === 'GET') {
        const tickets = await listTickets(db, owner);
        return respond({ ok: true, tickets, analytics: ticketAnalytics(tickets) });
      }
      if (!id && method === 'POST') return respond({ ok: true, ticket: await createTicket(db, owner, body) }, 201);
      if (id && method === 'GET') return respond({ ok: true, ticket: await getTicket(db, owner, id) });
      if (id && (method === 'PATCH' || method === 'PUT')) return respond({ ok: true, ticket: await updateTicket(db, owner, id, body) });
      if (id && method === 'DELETE') return respond({ ok: true, ...(await deleteTicket(db, owner, id)) });
    }
    if (resource === 'projects') {
      if (!id && method === 'GET') return respond({ ok: true, projects: await listProjects(db, owner, await listTickets(db, owner)) });
      if (!id && method === 'POST') return respond({ ok: true, project: await createProject(db, owner, body) }, 201);
      if (id && method === 'GET') {
        const projects = await listProjects(db, owner, await listTickets(db, owner));
        const project = projects.find((p) => p.id === id);
        if (!project) throw new WorkHttpError(404, 'project_not_found');
        return respond({ ok: true, project });
      }
      if (id && (method === 'PATCH' || method === 'PUT')) return respond({ ok: true, project: await updateProject(db, owner, id, body) });
      if (id && method === 'DELETE') return respond({ ok: true, ...(await deleteProject(db, owner, id, { hard: url.searchParams.get('hard') === '1' })) });
    }
    if (resource === 'calendar') {
      if (!calendarId && method === 'GET') {
        return respond({ ok: true, events: await listEvents(db, owner, { from: url.searchParams.get('from'), to: url.searchParams.get('to') }) });
      }
      if (!calendarId && method === 'POST') return respond({ ok: true, event: await createEvent(db, owner, body) }, 201);
      if (calendarId && (method === 'PATCH' || method === 'PUT')) return respond({ ok: true, event: await updateEvent(db, owner, calendarId, body) });
      if (calendarId && method === 'DELETE') return respond({ ok: true, ...(await deleteEvent(db, owner, calendarId)) });
    }
    return respond({ ok: false, error: 'method_not_allowed' }, 405);
  } catch (err) {
    if (err instanceof WorkHttpError) return respond({ ok: false, error: err.code }, err.status);
    console.error('work_data_error', String(err));
    return respond({ ok: false, error: String(err?.message || err) }, 500);
  }
}
