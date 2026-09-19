import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { getSessionToolReceipts, clearSessionToolReceipts, summarizeToolReceipts } from '../mcp/telemetry.js';
import { resolveProjectD1Database } from '../cloudflare/index.js';

export const DEFAULT_EVAL_RECORD_ENDPOINT = 'https://mcp.inneranimalmedia.com/api/eval/record';
export const DEFAULT_D1_DATABASE = '';
export const DEFAULT_TENANT_ID = 'default';
export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_USER_ID = 'default';

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

function escapeSqlString(str) {
  if (str == null) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
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

  const tenantId = clean(config.tenant || config.tenantId) || clean(options.tenantId) || clean(process.env.AGENTSAM_TENANT_ID) || DEFAULT_TENANT_ID;
  const workspaceId = clean(config.workspace || config.workspaceId) || clean(options.workspaceId) || clean(process.env.AGENTSAM_WORKSPACE_ID) || (options.cwd ? path.basename(options.cwd) : path.basename(process.cwd())) || DEFAULT_WORKSPACE_ID;
  const userId = clean(config.user || config.userId) || clean(options.userId) || clean(process.env.AGENTSAM_USER_ID) || clean(process.env.USER) || clean(os.userInfo?.()?.username) || DEFAULT_USER_ID;
  const explicitDb = clean(config.database || config.db) || clean(options.database || options.db);
  const database = explicitDb || resolveProjectD1Database(options.cwd ? path.resolve(options.cwd) : process.cwd()) || DEFAULT_D1_DATABASE;

  const baseCommit = safeGit('git rev-parse HEAD', options.cwd);
  const branch = safeGit('git branch --show-current', options.cwd);
  const now = new Date().toISOString();

  const runState = {
    schema_version: 'agentsam.eval.live.v1',
    run_id: runId,
    suite_id: suiteId,
    case_id: caseId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    database,
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

  const tenantId = clean(options.tenantId || options.tenant) || state.tenant_id || DEFAULT_TENANT_ID;
  const workspaceId = clean(options.workspaceId || options.workspace) || state.workspace_id || DEFAULT_WORKSPACE_ID;
  const userId = clean(options.userId || options.user) || state.user_id || DEFAULT_USER_ID;
  const targetDb = clean(options.database || options.db) || state.database || resolveProjectD1Database(options.cwd ? path.resolve(options.cwd) : process.cwd()) || DEFAULT_D1_DATABASE;

  // 1. Construct canonical D1 eval run record (agentsam_eval_runs)
  const evalRunRow = {
    id: state.run_id,
    suite_id: state.suite_id,
    case_id: state.case_id,
    tenant_id: tenantId,
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

  // 2. Construct canonical D1 model eval observation record (agentsam_model_eval_observations)
  const observationId = `obs_${state.run_id}`;
  const totalTokens = evalRunRow.input_tokens + evalRunRow.output_tokens;
  const fileLocations = {
    branch: state.branch || null,
    base_sha: state.base_commit || null,
    commit_sha: headCommit || null,
    files_changed: filesChanged,
    insertions,
    deletions,
    gate_status: gateStatus,
    tool_summary: toolSummary,
  };

  const modelObservationRow = {
    id: observationId,
    run_id: state.run_id,
    created_at: now,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    provider: state.provider,
    model_key: state.model,
    task_key: state.case_id,
    profile_slug: state.reasoning ? `reasoning-${state.reasoning}` : 'engineering-high',
    route_key: state.branch || null,
    passed: passed ? 1 : 0,
    status: 'completed',
    failure_class: passed ? null : (options.failureClass || 'verification_failed'),
    error_message: passed ? null : (options.errorMessage || null),
    latency_ms: durationMs,
    input_tokens: evalRunRow.input_tokens,
    output_tokens: evalRunRow.output_tokens,
    total_tokens: totalTokens,
    estimated_cost_usd: evalRunRow.cost_usd,
    response_id: headCommit ? `commit_${headCommit.slice(0, 7)}` : null,
    output_chars: Number(options.outputChars || 0),
    output_sha256: headCommit ? headCommit.slice(0, 7) : null,
    expected_markers_found: passed ? 1 : 0,
    expected_markers_total: 1,
    artifact_path: options.cwd || process.cwd(),
    raw_response_path: state.branch ? `origin/${state.branch}` : null,
    file_locations_json: JSON.stringify(fileLocations),
    updated_at: Math.floor(Date.now() / 1000),
  };

  // 3. Build SQL statements for both tables
  const sqlSuite = `INSERT OR IGNORE INTO agentsam_eval_suites (id, tenant_id, name, created_at, updated_at) VALUES (${escapeSqlString(evalRunRow.suite_id)}, ${escapeSqlString(evalRunRow.tenant_id)}, ${escapeSqlString(evalRunRow.suite_id)}, ${escapeSqlString(now)}, ${escapeSqlString(now)});`;
  const sqlCase = `INSERT OR IGNORE INTO agentsam_eval_cases (id, suite_id, tenant_id, input_prompt, created_at) VALUES (${escapeSqlString(evalRunRow.case_id)}, ${escapeSqlString(evalRunRow.suite_id)}, ${escapeSqlString(evalRunRow.tenant_id)}, ${escapeSqlString(evalRunRow.case_id)}, ${escapeSqlString(now)});`;

  const sqlRuns = `INSERT OR REPLACE INTO agentsam_eval_runs (
    id, suite_id, case_id, tenant_id, model_key, provider,
    latency_ms, cost_usd, input_tokens, output_tokens,
    score_quality, score_overall, passed,
    tool_calls_attempted, tool_calls_succeeded, retry_count, run_at
  ) VALUES (
    ${escapeSqlString(evalRunRow.id)},
    ${escapeSqlString(evalRunRow.suite_id)},
    ${escapeSqlString(evalRunRow.case_id)},
    ${escapeSqlString(evalRunRow.tenant_id)},
    ${escapeSqlString(evalRunRow.model_key)},
    ${escapeSqlString(evalRunRow.provider)},
    ${evalRunRow.latency_ms},
    ${evalRunRow.cost_usd},
    ${evalRunRow.input_tokens},
    ${evalRunRow.output_tokens},
    ${evalRunRow.score_quality},
    ${evalRunRow.score_overall},
    ${evalRunRow.passed},
    ${evalRunRow.tool_calls_attempted},
    ${evalRunRow.tool_calls_succeeded},
    ${evalRunRow.retry_count},
    ${escapeSqlString(evalRunRow.run_at)}
  );`;

  const sqlObs = `INSERT OR REPLACE INTO agentsam_model_eval_observations (
    id, run_id, created_at, tenant_id, workspace_id, user_id,
    provider, model_key, task_key, profile_slug, route_key,
    passed, status, failure_class, error_message, latency_ms,
    input_tokens, output_tokens, total_tokens, estimated_cost_usd,
    response_id, output_chars, output_sha256,
    expected_markers_found, expected_markers_total,
    artifact_path, raw_response_path, file_locations_json, updated_at
  ) VALUES (
    ${escapeSqlString(modelObservationRow.id)},
    ${escapeSqlString(modelObservationRow.run_id)},
    ${escapeSqlString(modelObservationRow.created_at)},
    ${escapeSqlString(modelObservationRow.tenant_id)},
    ${escapeSqlString(modelObservationRow.workspace_id)},
    ${escapeSqlString(modelObservationRow.user_id)},
    ${escapeSqlString(modelObservationRow.provider)},
    ${escapeSqlString(modelObservationRow.model_key)},
    ${escapeSqlString(modelObservationRow.task_key)},
    ${escapeSqlString(modelObservationRow.profile_slug)},
    ${escapeSqlString(modelObservationRow.route_key)},
    ${modelObservationRow.passed},
    ${escapeSqlString(modelObservationRow.status)},
    ${escapeSqlString(modelObservationRow.failure_class)},
    ${escapeSqlString(modelObservationRow.error_message)},
    ${modelObservationRow.latency_ms},
    ${modelObservationRow.input_tokens},
    ${modelObservationRow.output_tokens},
    ${modelObservationRow.total_tokens},
    ${modelObservationRow.estimated_cost_usd},
    ${escapeSqlString(modelObservationRow.response_id)},
    ${modelObservationRow.output_chars},
    ${escapeSqlString(modelObservationRow.output_sha256)},
    ${modelObservationRow.expected_markers_found},
    ${modelObservationRow.expected_markers_total},
    ${escapeSqlString(modelObservationRow.artifact_path)},
    ${escapeSqlString(modelObservationRow.raw_response_path)},
    ${escapeSqlString(modelObservationRow.file_locations_json)},
    ${modelObservationRow.updated_at}
  );`;

  const combinedSql = `${sqlSuite}\n\n${sqlCase}\n\n${sqlRuns}\n\n${sqlObs}\n`;

  const summary = {
    model: state.model,
    provider: state.provider,
    client: state.client,
    reasoning: state.reasoning,
    suite_id: state.suite_id,
    case_id: state.case_id,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    database: targetDb,
    elapsed_ms: durationMs,
    files_changed: filesChanged,
    insertions,
    deletions,
    head_commit: headCommit,
    gate_status: gateStatus,
    ...toolSummary,
    d1_sql: combinedSql,
  };

  // 4. Always archive the run evidence locally before anything else
  const runsDir = path.join(homeDirectory(options), '.agentsam', 'eval', 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const localRunFile = path.join(runsDir, `${state.run_id}.json`);
  const runPayload = {
    schema_version: 'agentsam.eval.run-record.v1',
    evalRunRow,
    modelObservationRow,
    summary,
    receipts,
  };
  fs.writeFileSync(localRunFile, JSON.stringify(runPayload, null, 2) + '\n', 'utf8');

  // 5. Remote persistence execution (if requested)
  let d1Executed = false;
  let d1Error = null;
  let persistenceMethod = null;

  if (options.remote) {
    const endpoint = clean(options.evalEndpoint) || clean(process.env.AGENTSAM_EVAL_ENDPOINT) || DEFAULT_EVAL_RECORD_ENDPOINT;

    // Primary route: structured HTTP POST (credential-boundary compliant, no local raw D1 shellout)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 8000));
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify({ evalRunRow, modelObservationRow }),
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data?.ok) {
          d1Executed = true;
          persistenceMethod = 'http_endpoint';
        } else {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (httpErr) {
      // Secondary fallback if wrangler is explicitly available/requested
      if (options.wranglerFallback !== false) {
        let tmpFile = null;
        try {
          tmpFile = path.join(os.tmpdir(), `agentsam_eval_${state.run_id}_${Date.now()}.sql`);
          fs.writeFileSync(tmpFile, combinedSql, 'utf8');
          execSync(`npx wrangler d1 execute ${targetDb} --remote --file="${tmpFile}"`, {
            cwd: options.cwd || process.cwd(),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          d1Executed = true;
          persistenceMethod = 'wrangler_file';
        } catch (wranglerErr) {
          d1Error = `HTTP (${httpErr.message}) & Wrangler (${wranglerErr.message})`;
        } finally {
          if (tmpFile && fs.existsSync(tmpFile)) {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        }
      } else {
        d1Error = httpErr.message;
      }
    }
  }

  // 6. Evidence preservation check:
  // If remote persistence was requested and failed, DO NOT erase active run or tool receipts unless --force
  if (options.remote && !d1Executed && !options.force) {
    return {
      evalRunRow,
      modelObservationRow,
      persisted_locally: true,
      local_file: localRunFile,
      summary: {
        ...summary,
        d1_executed: false,
        d1_error: d1Error,
        persisted_remote: false,
        state_preserved: true,
      },
      error: `remote_persistence_failed: ${d1Error}. Active run state preserved at ${filePath}. Retry with 'agentsam eval live finish --remote' or pass '--force' to finalize locally.`,
    };
  }

  // 7. Clear active run and session receipts only upon successful persistence or local completion
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  clearSessionToolReceipts(options);

  return {
    evalRunRow,
    modelObservationRow,
    persisted_locally: true,
    local_file: localRunFile,
    summary: {
      ...summary,
      d1_executed: d1Executed,
      d1_error: d1Error,
      persistence_method: persistenceMethod,
      persisted_remote: d1Executed,
    },
  };
}
