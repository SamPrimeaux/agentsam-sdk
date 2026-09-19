import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  finishLiveEvalRun,
  getLiveEvalStatus,
  startLiveEvalRun,
} from '../../src/eval/index.js';
import { recordToolReceipt } from '../../src/mcp/index.js';
import { runEval } from '../../src/commands/eval.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-live-eval-test-'));
}

test('live eval lifecycle: start, track receipts, get status, finish', async () => {
  const home = tempHome();

  // Initially inactive
  const initialStatus = getLiveEvalStatus({ home });
  assert.equal(initialStatus.active, false);

  // Start live eval run
  const run = startLiveEvalRun(
    {
      suite: 'sdk-real-work-20260919',
      case: 'cad-shell-unification',
      model: 'Muse Spark 1.3',
      provider: 'cursor',
      client: 'cursor',
      reasoning: 'high',
    },
    { home }
  );

  assert.ok(run.run_id.startsWith('evr_'));
  assert.equal(run.suite_id, 'sdk-real-work-20260919');
  assert.equal(run.case_id, 'cad-shell-unification');
  assert.equal(run.model, 'Muse Spark 1.3');

  // Verify starting again fails
  assert.throws(() => startLiveEvalRun({}, { home }), /live_eval_run_already_active/);

  // Record tool calls into the live session
  recordToolReceipt({ tool_key: 'github_read', source_client: 'cursor', duration_ms: 50 }, { home });
  recordToolReceipt({ tool_key: 'mcp:d1_query', source_client: 'cursor_mcp', duration_ms: 12 }, { home });
  recordToolReceipt({ tool_key: 'terminal_exec', source_client: 'agentsam', duration_ms: 300 }, { home });

  // Status check reflects active state and tool receipts
  const activeStatus = getLiveEvalStatus({ home });
  assert.equal(activeStatus.active, true);
  assert.equal(activeStatus.receipts_summary.tool_call_count, 3);
  assert.equal(activeStatus.receipts_summary.mcp_call_count, 1);

  // Finish run
  const result = await finishLiveEvalRun({ home, gate: 'PASS' });
  assert.equal(result.evalRunRow.id, run.run_id);
  assert.equal(result.evalRunRow.passed, 1);
  assert.equal(result.evalRunRow.tool_calls_attempted, 3);
  assert.equal(result.evalRunRow.tool_calls_succeeded, 3);
  assert.equal(result.modelObservationRow.id, `obs_${run.run_id}`);
  assert.equal(result.modelObservationRow.passed, 1);

  // After finish, status is inactive again
  const postStatus = getLiveEvalStatus({ home });
  assert.equal(postStatus.active, false);
});

test('agentsam eval live CLI commands work end-to-end', async () => {
  const home = tempHome();
  const logs = [];
  const write = (str) => logs.push(str);

  // CLI start
  const startResult = await runEval(
    ['live', 'start', '--case', 'errors-v1-reconciliation', '--model', 'Muse Spark 1.3', '--json'],
    { home, write }
  );
  assert.ok(startResult.run_id.startsWith('evr_'));

  // Record receipt
  recordToolReceipt({ tool_key: 'mcp:eval_query', source_client: 'cursor_mcp', duration_ms: 40 }, { home });

  // CLI status
  const statusResult = await runEval(['live', 'status', '--json'], { home, write });
  assert.equal(statusResult.active, true);
  assert.equal(statusResult.receipts_summary.tool_call_count, 1);

  // CLI finish
  const finishResult = await runEval(['live', 'finish', '--gate', 'PASS', '--json'], { home, write });
  assert.equal(finishResult.evalRunRow.passed, 1);
  assert.equal(finishResult.summary.gate_status, 'PASS');

  // Verify non-JSON output formats cleanly
  const emptyStatus = await runEval(['live', 'status'], { home, write });
  assert.equal(emptyStatus.active, false);
});

test('finishLiveEvalRun archives run locally, generates SQL for both tables, and respects configurable tenant/database', async () => {
  const home = tempHome();
  const run = startLiveEvalRun(
    {
      case: 'cad-render-eval',
      model: 'Muse Spark 1.3',
      tenant: 'test-tenant',
      workspace: 'cad-workspace',
      user: 'test-user',
      database: 'test-database',
    },
    { home }
  );

  assert.equal(run.tenant_id, 'test-tenant');
  assert.equal(run.workspace_id, 'cad-workspace');
  assert.equal(run.user_id, 'test-user');
  assert.equal(run.database, 'test-database');

  const result = await finishLiveEvalRun({ home, gate: 'PASS' });

  // 1. Dual record construction
  assert.equal(result.evalRunRow.tenant_id, 'test-tenant');
  assert.equal(result.modelObservationRow.tenant_id, 'test-tenant');
  assert.equal(result.modelObservationRow.workspace_id, 'cad-workspace');
  assert.equal(result.modelObservationRow.user_id, 'test-user');
  assert.equal(result.modelObservationRow.status, 'completed');
  assert.equal(result.modelObservationRow.passed, 1);
  assert.equal(result.modelObservationRow.expected_markers_total, 1);
  assert.equal(typeof result.modelObservationRow.output_chars, 'number');

  // 2. Both tables present in generated D1 SQL
  assert.ok(result.summary.d1_sql.includes('INSERT OR REPLACE INTO agentsam_eval_runs'));
  assert.ok(result.summary.d1_sql.includes('INSERT OR REPLACE INTO agentsam_model_eval_observations'));

  // 3. Local archive created
  const archivedRunPath = path.join(home, '.agentsam', 'eval', 'runs', `${run.run_id}.json`);
  assert.ok(fs.existsSync(archivedRunPath), 'Archived run file must exist locally');
  const archived = JSON.parse(fs.readFileSync(archivedRunPath, 'utf8'));
  assert.equal(archived.evalRunRow.id, run.run_id);
  assert.equal(archived.modelObservationRow.id, `obs_${run.run_id}`);
});

test('finishLiveEvalRun preserves active run state and receipts if remote persistence fails without --force', async () => {
  const home = tempHome();
  const run = startLiveEvalRun({ case: 'resilience-test' }, { home });

  recordToolReceipt({ tool_key: 'git_status', duration_ms: 20 }, { home });

  // Call finish with remote=true pointing to an unreachable endpoint and wrangler fallback disabled
  const result = await finishLiveEvalRun({
    home,
    remote: true,
    evalEndpoint: 'http://127.0.0.1:1/nonexistent',
    wranglerFallback: false,
    timeoutMs: 100,
  });

  // Verification: remote failure noted, evidence preserved, active run kept intact
  assert.equal(result.summary.d1_executed, false);
  assert.equal(result.summary.state_preserved, true);
  assert.ok(result.summary.d1_error);

  const activeStatus = getLiveEvalStatus({ home });
  assert.equal(activeStatus.active, true, 'Active run state must be retained when remote persistence fails');
  assert.equal(activeStatus.receipts_summary.tool_call_count, 1, 'Tool receipts must be preserved when remote persistence fails');

  // Finish with force: true to finalize and clear active run
  const forcedResult = await finishLiveEvalRun({
    home,
    remote: true,
    evalEndpoint: 'http://127.0.0.1:1/nonexistent',
    wranglerFallback: false,
    timeoutMs: 100,
    force: true,
  });

  assert.equal(forcedResult.summary.d1_executed, false);
  const clearedStatus = getLiveEvalStatus({ home });
  assert.equal(clearedStatus.active, false, 'Forced finish clears active run');
});

test('finishLiveEvalRun reuses the configured inneranimalmedia MCP bearer for remote persistence', { concurrency: false }, async () => {
  const home = tempHome();
  const mcpDir = path.join(home, '.agentsam', 'mcp');
  fs.mkdirSync(mcpDir, { recursive: true });
  fs.writeFileSync(
    path.join(mcpDir, 'inneranimalmedia.json'),
    JSON.stringify({ auth: { type: 'bearer', token: 'fixture-eval-token' } }),
  );

  startLiveEvalRun({ case: 'authenticated-remote-eval' }, { home });

  const originalFetch = globalThis.fetch;
  let authorization = null;
  try {
    globalThis.fetch = async (_url, init = {}) => {
      authorization = new Headers(init.headers).get('Authorization');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await finishLiveEvalRun({
      home,
      remote: true,
      evalEndpoint: 'https://example.test/api/eval/record',
      wranglerFallback: false,
    });

    assert.equal(authorization, 'Bearer fixture-eval-token');
    assert.equal(result.summary.d1_executed, true);
    assert.equal(result.summary.persistence_method, 'http_endpoint');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
