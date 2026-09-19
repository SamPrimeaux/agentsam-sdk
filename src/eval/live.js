import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { getSessionToolReceipts, clearSessionToolReceipts, summarizeToolReceipts } from '../mcp/telemetry.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function homeDirectory(options = {}) {
  return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir());
}

export function getEvalStatePath(options = {}) {
  if (options.cwd) {
    return path.join(options.cwd, '.agentsam', 'eval', 'active-run.json');
  }
  return path.join(homeDirectory(options), '.agentsam', 'eval', 'active-run.json');
}

function safeGit(cmd, cwd = process.cwd()) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function startLiveEvalRun(config = {}, options = {}) {
  const filePath = getEvalStatePath(options);
  if (fs.existsSync(filePath)) {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (existing?.status === 'running') {
      throw new Error(`live_eval_run_already_active:${existing.run_id}`);
    }
  }

  const runId = `evr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const suiteId = clean(config.suite) || 'sdk-real-work-20260919';
  const caseId = clean(config.case) || clean(config.caseId) || 'general-task';
  const model = clean(config.model) || 'Muse Spark 1.3';
  const provider = clean(config.provider) || 'cursor';
  const client = clean(config.client) || 'cursor';
  const reasoning = clean(config.reasoning) || 'high';

  const baseCommit = safeGit('git rev-parse HEAD', options.cwd);
  const branch = safeGit('git branch --show-current', options.cwd);
  const now = new Date().toISOString();

  const runState = {
    schema_version: 'agentsam.eval.live.v1',
    run_id: runId,
    suite_id: suiteId,
    case_id: caseId,
    tenant_id: 'inneranimalmedia',
    model,
    provider,
    client,
    reasoning,
    status: 'running',
    started_at: now,
    base_commit: baseCommit,
    branch,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(runState, null, 2), 'utf8');

  return runState;
}

export function getLiveEvalStatus(options = {}) {
  const filePath = getEvalStatePath(options);
  if (!fs.existsSync(filePath)) {
    return { active: false };
  }

  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (state.status !== 'running') {
      return { active: false, previousRun: state };
    }

    const elapsedMs = Date.now() - Date.parse(state.started_at);
    const receipts = getSessionToolReceipts(options);
    const summary = summarizeToolReceipts(receipts);

    return {
      active: true,
      ...state,
      elapsed_ms: elapsedMs,
      receipts_summary: summary,
    };
  } catch {
    return { active: false };
  }
}

export async function finishLiveEvalRun(options = {}) {
  const filePath = getEvalStatePath(options);
  if (!fs.existsSync(filePath)) {
    throw new Error('no_active_live_eval_run');
  }

  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const now = new Date().toISOString();
  const durationMs = Date.now() - Date.parse(state.started_at);

  const headCommit = safeGit('git rev-parse HEAD', options.cwd);
  const diffStat = state.base_commit
    ? safeGit(`git diff --shortstat ${state.base_commit} ${headCommit || 'HEAD'}`, options.cwd)
    : safeGit('git diff --shortstat HEAD~1 HEAD', options.cwd);

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  if (diffStat) {
    const mFiles = diffStat.match(/(\d+)\s+files?\s+changed/);
    const mIns = diffStat.match(/(\d+)\s+insertions?\(\+\)/);
    const mDel = diffStat.match(/(\d+)\s+deletions?\(-\)/);
    if (mFiles) filesChanged = Number(mFiles[1]);
    if (mIns) insertions = Number(mIns[1]);
    if (mDel) deletions = Number(mDel[1]);
  }

  const receipts = getSessionToolReceipts(options);
  const toolSummary = summarizeToolReceipts(receipts);

  const passed = options.gate ? options.gate.toUpperCase() === 'PASS' : (options.passed !== false);
  const gateStatus = passed ? 'PASS' : 'FAIL';

  // Construct D1 eval run record
  const evalRunRow = {
    id: state.run_id,
    suite_id: state.suite_id,
    case_id: state.case_id,
    tenant_id: state.tenant_id || 'inneranimalmedia',
    model_key: state.model,
    provider: state.provider,
    input_tokens: Number(options.inputTokens || 0),
    output_tokens: Number(options.outputTokens || 0),
    latency_ms: durationMs,
    cost_usd: Number(options.costUsd || 0),
    score_quality: passed ? 1.0 : 0.0,
    score_overall: passed ? 1.0 : 0.0,
    passed: passed ? 1 : 0,
    run_at: state.started_at,
    tool_calls_attempted: toolSummary.tool_call_count,
    tool_calls_succeeded: toolSummary.success_count,
    retry_count: toolSummary.failure_count,
  };

  // Construct D1 model eval observation record
  const observationId = `obs_${state.run_id}`;
  const modelObservationRow = {
    id: observationId,
    run_id: state.run_id,
    created_at: now,
    tenant_id: state.tenant_id || 'inneranimalmedia',
    provider: state.provider,
    model_key: state.model,
    task_key: state.case_id,
    passed: passed ? 1 : 0,
    status: 'completed',
    latency_ms: durationMs,
    input_tokens: evalRunRow.input_tokens,
    output_tokens: evalRunRow.output_tokens,
    total_tokens: evalRunRow.input_tokens + evalRunRow.output_tokens,
    estimated_cost_usd: evalRunRow.cost_usd,
    expected_markers_found: passed ? 1 : 0,
    expected_markers_total: 1,
  };

  // If remote D1 write requested, execute or generate SQL
  let d1Sql = `INSERT INTO agentsam_eval_runs (id, suite_id, case_id, tenant_id, model_key, provider, latency_ms, passed, tool_calls_attempted, tool_calls_succeeded, retry_count, run_at) VALUES ('${evalRunRow.id}', '${evalRunRow.suite_id}', '${evalRunRow.case_id}', '${evalRunRow.tenant_id}', '${evalRunRow.model_key}', '${evalRunRow.provider}', ${evalRunRow.latency_ms}, ${evalRunRow.passed}, ${evalRunRow.tool_calls_attempted}, ${evalRunRow.tool_calls_succeeded}, ${evalRunRow.retry_count}, '${evalRunRow.run_at}');`;

  let d1Executed = false;
  let d1Error = null;

  if (options.remote) {
    try {
      execSync(`npx wrangler d1 execute inneranimalmedia-business --remote --command="${d1Sql.replace(/"/g, '\\"')}"`, {
        cwd: options.cwd || process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      d1Executed = true;
    } catch (err) {
      d1Error = err.message;
    }
  }

  // Clear state and telemetry
  fs.unlinkSync(filePath);
  clearSessionToolReceipts(options);

  return {
    evalRunRow,
    modelObservationRow,
    summary: {
      model: state.model,
      provider: state.provider,
      client: state.client,
      reasoning: state.reasoning,
      suite_id: state.suite_id,
      case_id: state.case_id,
      elapsed_ms: durationMs,
      files_changed: filesChanged,
      insertions,
      deletions,
      head_commit: headCommit,
      gate_status: gateStatus,
      ...toolSummary,
      d1_executed: d1Executed,
      d1_error: d1Error,
      d1_sql: d1Sql,
    },
  };
}
