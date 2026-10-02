import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createLocalSqliteDatabaseSync } from '../local/sqlite.js';
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
  if (!fs.existsSync(dbPath)) throw new Error('Local AgentSam DB is not initialized - run agentsam db init first.');
  const db = createLocalSqliteDatabaseSync(dbPath);
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
    "SELECT * FROM agentsam_plans " +
    "WHERE json_extract(metadata_json, '$.repository_id') = ? " +
    "AND status IN ('active','draft') " +
    "ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at_unix DESC, created_at_unix DESC LIMIT 1"
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

export function setPlanStepStatus(ctx, taskId, status, { reason = null } = {}) {
  const allowed = new Set(['open', 'running', 'blocked', 'complete', 'cancelled']);
  if (!allowed.has(status)) throw new Error('invalid_step_status:' + status);
  const task = hydrateTask(ctx.db.prepare('SELECT * FROM agentsam_todo WHERE id = ? LIMIT 1').get(taskId));
  if (!task) throw new Error('step_not_found:' + taskId);
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
