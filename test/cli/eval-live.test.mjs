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
