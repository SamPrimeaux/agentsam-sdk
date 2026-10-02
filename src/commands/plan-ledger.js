import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createLocalSqliteDatabaseSync } from '../local/sqlite.js';
import { applyRuntimeMigrationsSync } from '../local/migrations.js';
import { getLocalDatabasePath, readProjectConfig } from '../lib/project-config.js';
import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';

function id(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + randomBytes(4).toString('hex');
}

function parseJson(value, fallback) {
  try { return JSON.parse(String(value || '')); }
  catch { return fallback; }
}

function repositoryIdFor(root, git, config) {
  return config?.repository?.id
    || (git?.repoFullName ? 'github:' + git.repoFullName.toLowerCase() : null)
    || 'local:' + root;
}

export function openPlanLedger(cwd = process.cwd()) {
  const git = tryResolveGitContext({ cwd });
  const root = git?.root || path.resolve(cwd);
  const config = readProjectConfig(root);
  const dbPath = path.resolve(root, getLocalDatabasePath(config));
  const db = createLocalSqliteDatabaseSync(dbPath);
  applyRuntimeMigrationsSync(db);
  db.exec('PRAGMA foreign_keys = ON;');
  return {
    db, dbPath, root, git,
    repositoryId: repositoryIdFor(root, git, config),
    close() { db.close(); },
  };
}

function planMetadata(ctx, input = {}) {
  return {
    schema: 'agentsam.plan.v1',
    repository_id: ctx.repositoryId,
    repository_root: ctx.root,
    branch: ctx.git?.branch || null,
    revision: ctx.git?.revisionSha || null,
    dirty: Boolean(ctx.git?.dirty),
    goal: input.goal || input.title || '',
    acceptance: input.acceptance || [],
    evidence: input.evidence || [],
    scope: input.scope || {},
    created_by: input.createdBy || 'cli',
  };
}

function taskMetadata(ctx, input = {}) {
  return {
    schema: 'agentsam.todo.v1',
    repository_id: ctx.repositoryId,
    kind: input.kind || 'work',
    depends_on: input.dependsOn || [],
    acceptance: input.acceptance || [],
    evidence: input.evidence || [],
    blocker_reason: input.blockerReason || null,
  };
}

function hydratePlan(row) {
  return row ? { ...row, metadata: parseJson(row.metadata_json, {}) } : null;
}

function hydrateTask(row) {
  return row ? { ...row, metadata: parseJson(row.metadata_json, {}) } : null;
}

function refreshPlanCounts(ctx, planId) {
  const counts = ctx.db.prepare(
    "SELECT COUNT(*) AS total, " +
    "SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS done, " +
    "SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked " +
    "FROM agentsam_todo WHERE plan_id = ?"
  ).get(planId);
  ctx.db.prepare(
    'UPDATE agentsam_plans SET tasks_total = ?, tasks_done = ?, tasks_blocked = ?, updated_at_unix = unixepoch() WHERE id = ?'
  ).run(Number(counts?.total || 0), Number(counts?.done || 0), Number(counts?.blocked || 0), planId);
}

export function createPlan(ctx, input) {
  const title = String(input?.title || '').trim();
  if (!title) throw new Error('plan_title_required');
  const goal = String(input?.goal || title).trim();
  const planId = id('plan');
  const metadata = planMetadata(ctx, { ...input, title, goal });
  ctx.db.prepare(
    "INSERT INTO agentsam_plans (" +
    "id, account_id, session_id, agent_run_id, plan_type, title, status, summary_text, token_budget, metadata_json" +
    ") VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)"
  ).run(
    planId,
    input?.accountId || null,
    input?.sessionId || null,
    input?.agentRunId || null,
    input?.planType || 'feature',
    title,
    goal,
    input?.tokenBudget ?? null,
    JSON.stringify(metadata),
  );
  return getPlan(ctx, planId);
}

export function listPlans(ctx, { all = false } = {}) {
  const sql =
    "SELECT * FROM agentsam_plans " +
    "WHERE json_extract(metadata_json, '$.repository_id') = ? " +
    (all ? '' : "AND status IN ('draft','active') ") +
    "ORDER BY updated_at_unix DESC, created_at_unix DESC";
  return ctx.db.prepare(sql).all(ctx.repositoryId).map(hydratePlan);
}

export function getCurrentPlan(ctx) {
  const row = ctx.db.prepare(
    "SELECT p.* FROM agentsam_plans p " +
    "WHERE json_extract(p.metadata_json, '$.repository_id') = ? " +
    "AND p.status IN ('active','draft') " +
    "ORDER BY " +
    "EXISTS(SELECT 1 FROM agentsam_todo t WHERE t.plan_id = p.id AND t.status = 'running') DESC, " +
    "CASE p.status WHEN 'active' THEN 0 ELSE 1 END, p.updated_at_unix DESC, p.created_at_unix DESC LIMIT 1"
  ).get(ctx.repositoryId);
  return hydratePlan(row);
}

export function getPlan(ctx, planId = 'current') {
  const plan = planId === 'current'
    ? getCurrentPlan(ctx)
    : hydratePlan(ctx.db.prepare('SELECT * FROM agentsam_plans WHERE id = ? LIMIT 1').get(planId));
  if (!plan) return null;
  const tasks = ctx.db.prepare(
    'SELECT * FROM agentsam_todo WHERE plan_id = ? ORDER BY sort_order ASC, created_at_unix ASC'
  ).all(plan.id).map(hydrateTask);
  return { ...plan, tasks };
}

export function addPlanStep(ctx, input) {
  const plan = getPlan(ctx, input?.planId || 'current');
  if (!plan) throw new Error('active_plan_required');
  const title = String(input?.title || '').trim();
  if (!title) throw new Error('step_title_required');
  const taskId = id('todo');
  const order = ctx.db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM agentsam_todo WHERE plan_id = ?'
  ).get(plan.id)?.next_order || 10;
  ctx.db.prepare(
    "INSERT INTO agentsam_todo (" +
    "id, account_id, plan_id, agent_run_id, title, description, status, priority, sort_order, token_budget, requires_approval, metadata_json" +
    ") VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)"
  ).run(
    taskId,
    input?.accountId || plan.account_id || null,
    plan.id,
    input?.agentRunId || null,
    title,
    input?.description || null,
    input?.priority || 'medium',
    Number(order),
    input?.tokenBudget ?? null,
    input?.requiresApproval ? 1 : 0,
    JSON.stringify(taskMetadata(ctx, input)),
  );
  refreshPlanCounts(ctx, plan.id);
  return hydrateTask(ctx.db.prepare('SELECT * FROM agentsam_todo WHERE id = ?').get(taskId));
}

const PRIORITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

function getTask(ctx, taskId) {
  return hydrateTask(ctx.db.prepare('SELECT * FROM agentsam_todo WHERE id = ? LIMIT 1').get(taskId));
}

function dependencyBlockers(ctx, task) {
  const ids = Array.isArray(task?.metadata?.depends_on) ? task.metadata.depends_on : [];
  if (!ids.length) return [];
  const blockers = [];
  for (const dependencyId of ids) {
    const dependency = getTask(ctx, dependencyId);
    if (!dependency || dependency.status !== 'complete') {
      blockers.push({
        id: dependencyId,
        status: dependency?.status || 'missing',
        title: dependency?.title || null,
      });
    }
  }
  return blockers;
}

function pendingAcceptance(task) {
  const entries = Array.isArray(task?.metadata?.acceptance) ? task.metadata.acceptance : [];
  return entries.filter((entry) => {
    if (typeof entry === 'string') return true;
    if (!entry || typeof entry !== 'object') return false;
    return entry.required !== false && entry.status !== 'accepted';
  });
}

export function getNextPlanStep(ctx, { planId = 'current', start = false } = {}) {
  const plan = getPlan(ctx, planId);
  if (!plan) throw new Error('plan_not_found');
  const rank = (a, b) => {
    const priority = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (priority !== 0) return priority;
    if (Number(a.sort_order) !== Number(b.sort_order)) return Number(a.sort_order) - Number(b.sort_order);
    return Number(a.created_at_unix) - Number(b.created_at_unix);
  };
  const running = (plan.tasks || []).filter((task) => task.status === 'running').sort(rank);
  if (running.length) {
    const selected = running[0];
    return {
      plan: { id: plan.id, title: plan.title, status: plan.status },
      step: selected,
      selection: 'running',
      blocked: [],
      evidence: selected?.metadata?.evidence || [],
      acceptance: selected?.metadata?.acceptance || [],
      depends_on: selected?.metadata?.depends_on || [],
      recommended_action: 'agentsam plan show ' + plan.id,
    };
  }

  const candidates = (plan.tasks || [])
    .filter((task) => task.status === 'open')
    .sort(rank);

  const blocked = [];
  let selected = null;
  for (const task of candidates) {
    const blockers = dependencyBlockers(ctx, task);
    if (!blockers.length) {
      selected = task;
      break;
    }
    blocked.push({ task_id: task.id, blockers });
  }

  if (selected && start) selected = setPlanStepStatus(ctx, selected.id, 'running');
  return {
    plan: { id: plan.id, title: plan.title, status: plan.status },
    step: selected,
    selection: selected ? (start ? 'started' : 'open') : 'none',
    blocked,
    evidence: selected?.metadata?.evidence || [],
    acceptance: selected?.metadata?.acceptance || [],
    depends_on: selected?.metadata?.depends_on || [],
    recommended_action: selected ? ('agentsam plan ' + (start ? 'show ' : 'start ') + selected.id) : null,
  };
}

export function addPlanStepEvidence(ctx, taskId, input = {}) {
  const task = getTask(ctx, taskId);
  if (!task) throw new Error('step_not_found:' + taskId);
  const type = String(input.type || 'evidence').trim();
  const ref = String(input.ref || '').trim();
  if (!ref) throw new Error('evidence_ref_required');
  const metadata = { ...task.metadata };
  const evidence = Array.isArray(metadata.evidence) ? [...metadata.evidence] : [];
  const duplicate = evidence.some((entry) => entry && typeof entry === 'object' && entry.type === type && entry.ref === ref);
  if (!duplicate) {
    evidence.push({
      type,
      ref,
      hash: input.hash ? String(input.hash) : null,
      note: input.note ? String(input.note) : null,
      added_at_unix: Math.floor(Date.now() / 1000),
    });
  }
  metadata.evidence = evidence;
  ctx.db.prepare('UPDATE agentsam_todo SET metadata_json = ?, updated_at_unix = unixepoch() WHERE id = ?')
    .run(JSON.stringify(metadata), taskId);
  return getTask(ctx, taskId);
}

export function acceptPlanStep(ctx, taskId, criterion, { evidenceRef = null } = {}) {
  const task = getTask(ctx, taskId);
  if (!task) throw new Error('step_not_found:' + taskId);
  const text = String(criterion || '').trim();
  if (!text) throw new Error('acceptance_criterion_required');
  const metadata = { ...task.metadata };
  const entries = Array.isArray(metadata.acceptance) ? [...metadata.acceptance] : [];
  const now = Math.floor(Date.now() / 1000);
  let matched = false;
  metadata.acceptance = entries.map((entry) => {
    const entryText = typeof entry === 'string' ? entry : String(entry?.criterion || '');
    if (entryText !== text) return entry;
    matched = true;
    return {
      criterion: text,
      required: typeof entry === 'object' ? entry.required !== false : true,
      status: 'accepted',
      accepted_at_unix: now,
      evidence_ref: evidenceRef || (typeof entry === 'object' ? entry.evidence_ref || null : null),
    };
  });
  if (!matched) {
    metadata.acceptance.push({
      criterion: text,
      required: true,
      status: 'accepted',
      accepted_at_unix: now,
      evidence_ref: evidenceRef || null,
    });
  }
  ctx.db.prepare('UPDATE agentsam_todo SET metadata_json = ?, updated_at_unix = unixepoch() WHERE id = ?')
    .run(JSON.stringify(metadata), taskId);
  return getTask(ctx, taskId);
}

export function addPlanDependency(ctx, taskId, dependencyId) {
  const task = getTask(ctx, taskId);
  const dependency = getTask(ctx, dependencyId);
  if (!task) throw new Error('step_not_found:' + taskId);
  if (!dependency) throw new Error('dependency_not_found:' + dependencyId);
  if (task.plan_id !== dependency.plan_id) throw new Error('dependency_cross_plan_not_allowed');
  if (task.id === dependency.id) throw new Error('dependency_self_reference');
  const metadata = { ...task.metadata };
  const dependsOn = new Set(Array.isArray(metadata.depends_on) ? metadata.depends_on : []);
  dependsOn.add(dependency.id);
  metadata.depends_on = [...dependsOn];
  ctx.db.prepare('UPDATE agentsam_todo SET metadata_json = ?, updated_at_unix = unixepoch() WHERE id = ?')
    .run(JSON.stringify(metadata), taskId);
  return getTask(ctx, taskId);
}

export function setPlanStepStatus(ctx, taskId, status, { reason = null } = {}) {
  const allowed = new Set(['open', 'running', 'blocked', 'complete', 'cancelled']);
  if (!allowed.has(status)) throw new Error('invalid_step_status:' + status);
  const task = getTask(ctx, taskId);
  if (!task) throw new Error('step_not_found:' + taskId);
  if (status === 'complete') {
    const blockers = dependencyBlockers(ctx, task);
    if (blockers.length) throw new Error('step_dependencies_incomplete:' + blockers.map((row) => row.id).join(','));
    const acceptance = pendingAcceptance(task);
    if (acceptance.length) {
      const labels = acceptance.map((entry) => typeof entry === 'string' ? entry : entry.criterion).filter(Boolean);
      throw new Error('step_acceptance_incomplete:' + labels.join(' | '));
    }
  }
  const metadata = { ...task.metadata };
  if (status === 'blocked') metadata.blocker_reason = reason || metadata.blocker_reason || 'blocked';
  else metadata.blocker_reason = null;

  let startedSql = 'started_at_unix';
  let completedSql = 'NULL';
  if (status === 'running') startedSql = 'COALESCE(started_at_unix, unixepoch())';
  if (status === 'complete') completedSql = 'unixepoch()';
  if (status === 'cancelled') completedSql = 'COALESCE(completed_at_unix, unixepoch())';

  ctx.db.prepare(
    'UPDATE agentsam_todo SET status = ?, metadata_json = ?, started_at_unix = ' + startedSql +
    ', completed_at_unix = ' + completedSql + ', updated_at_unix = unixepoch() WHERE id = ?'
  ).run(status, JSON.stringify(metadata), taskId);
  refreshPlanCounts(ctx, task.plan_id);
  return hydrateTask(ctx.db.prepare('SELECT * FROM agentsam_todo WHERE id = ?').get(taskId));
}

export function setPlanStatus(ctx, planId, status) {
  const allowed = new Set(['draft', 'active', 'complete', 'abandoned']);
  if (!allowed.has(status)) throw new Error('invalid_plan_status:' + status);
  const plan = getPlan(ctx, planId || 'current');
  if (!plan) throw new Error('plan_not_found');
  ctx.db.prepare('UPDATE agentsam_plans SET status = ?, updated_at_unix = unixepoch() WHERE id = ?').run(status, plan.id);
  return getPlan(ctx, plan.id);
}
