import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { evaluateContextFixture, listContextEvalFixtures } from '../src/eval/index.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

test('context eval ships AgentSam-shaped deterministic fixtures and never calls a provider', async () => {
  const fixtures = listContextEvalFixtures();
  assert.ok(fixtures.length >= 6);
  assert.ok(fixtures.includes('continuation-after-compaction'));
  const report = await evaluateContextFixture({ fixture: 'exact-symbol-callers' });
  assert.equal(report.live_provider_used, false);
  assert.equal(report.strategies.length, 3);
  assert.ok(report.strategies.every(row => row.result === 'PASS'));
  assert.ok(report.winner);
});

test('compaction fixture reaches a proactive pressure region and proves explicit rehydration', async () => {
  const report = await evaluateContextFixture({ fixture: 'continuation-after-compaction', strategy: 'compact' });
  const row = report.strategies[0];
  assert.equal(row.result, 'PASS');
  assert.ok(row.compacted_chars > 0);
  assert.ok(row.rehydrated_refs.includes('tool:call_previous'));
  assert.ok(row.active_context_tokens < row.pricing_threshold_tokens);
});

test('CLI JSON context eval is stable and offline', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', 'eval', 'context', '--fixture', 'two-file-repair', '--strategy', 'discovery', '--json'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.fixture, 'two-file-repair');
  assert.equal(report.live_provider_used, false);
  assert.equal(report.strategies[0].strategy, 'discovery');
  assert.equal(report.strategies[0].result, 'PASS');
});
