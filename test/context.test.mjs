import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_RESULT_POLICY,
  assessContextUsage,
  compileAgentInstructions,
  createContextBudget,
  normalizeResultPolicy,
  resolveContext,
  resolveProjectContext,
} from '../src/context/index.js';

test('default result policy is bounded and callers may request less', () => {
  assert.deepEqual(DEFAULT_RESULT_POLICY, { max_items: 8, max_chars: 24_000, detail: 'excerpt' });
  assert.deepEqual(normalizeResultPolicy({ max_items: 3, max_chars: 8_000, detail: 'card' }), { max_items: 3, max_chars: 8_000, detail: 'card' });
  assert.throws(() => normalizeResultPolicy({ max_items: 9 }), /higher_detail_required:max_items/);
  assert.throws(() => normalizeResultPolicy({ max_chars: 24_001 }), /higher_detail_required:max_chars/);
  assert.throws(() => normalizeResultPolicy({ detail: 'full' }), /higher_detail_required:detail/);
  assert.equal(normalizeResultPolicy({ detail: 'full', max_items: 20, max_chars: 100_000 }, { operation: 'higher-detail' }).detail, 'full');
});

test('legacy ratio context budget remains compatible for ordinary windows', () => {
  const budget = createContextBudget({ windowTokens: 250_000 });
  assert.equal(budget.targetInputTokens, 150_000);
  assert.equal(budget.hardInputTokens, 212_500);
  assert.equal(budget.windowChars, 1_000_000);
  assert.equal(budget.maxSystemChars, 50_000);
  assert.equal(budget.maxToolSchemaChars, 40_000);
  assert.equal(budget.maxEvidenceChars, 100_000);
  assert.equal(budget.maxFileCharsPerRead, 32_768);
  assert.equal(budget.maxFileCharsPerTurn, 131_072);
  assert.equal(budget.maxToolResultChars, 24_000);
});

test('large model capacity is independent from AgentSam working-set and pricing policy', () => {
  const budget = createContextBudget({
    windowTokens: 1_050_000,
    targetInputTokens: 120_000,
    compactAtTokens: 180_000,
    interveneAtTokens: 220_000,
    maxNormalInputTokens: 250_000,
    pricingThresholdTokens: 272_000,
    safetyMarginTokens: 22_000,
  });
  assert.equal(budget.windowTokens, 1_050_000);
  assert.equal(budget.targetInputTokens, 120_000);
  assert.equal(budget.compactAtTokens, 180_000);
  assert.equal(budget.interveneAtTokens, 220_000);
  assert.equal(budget.maxNormalInputTokens, 250_000);
  assert.equal(budget.pricingThresholdTokens, 272_000);
  assert.ok(budget.targetInputRatio < 0.12);

  assert.equal(assessContextUsage(179_999, budget).shouldCompact, false);
  assert.equal(assessContextUsage(180_000, budget).shouldCompact, true);
  assert.equal(assessContextUsage(272_000, budget).pricingThresholdCrossed, false);
  const crossed = assessContextUsage(272_001, budget);
  assert.equal(crossed.pricingThresholdCrossed, true);
  assert.equal(crossed.tokensUntilPricingThreshold, -1);
});

test('context.resolve separates composition classes and returns an economic receipt', () => {
  const budget = createContextBudget({
    windowTokens: 32_000,
    maxEvidenceChars: 90,
    maxFileCharsPerRead: 50,
    maxFileCharsPerTurn: 60,
    maxToolResultChars: 30,
  });
  const pack = resolveContext({
    objective: 'fix terminal cwd persistence',
    refs: ['repo:demo'],
    budget,
    instructionChars: 20,
    toolSchemaChars: 12,
    historyChars: 8,
    items: [
      { ref: 'file:low', kind: 'file', priority: 1, content: 'L'.repeat(50) },
      { ref: 'tool:high', kind: 'tool_result', priority: 10, content: 'T'.repeat(50) },
      { ref: 'file:high', kind: 'file', priority: 8, content: 'F'.repeat(80) },
      { ref: 'memory:later', kind: 'memory', priority: 0, content: 'M'.repeat(40) },
    ],
  });

  assert.deepEqual(pack.items.map((item) => item.ref), ['tool:high', 'file:high', 'file:low']);
  assert.equal(pack.items[0].chars, 30);
  assert.equal(pack.items[1].chars, 50);
  assert.equal(pack.items[2].chars, 10);
  assert.equal(pack.receipt.tool_result_chars, 30);
  assert.equal(pack.receipt.evidence_chars, 60);
  assert.equal(pack.receipt.instruction_chars, 20);
  assert.equal(pack.receipt.tool_schema_chars, 12);
  assert.equal(pack.receipt.history_chars, 8);
  assert.equal(pack.receipt.chars, 130);
  assert.equal(pack.receipt.estimate_kind, 'local');
  assert.equal(pack.receipt.window_tokens, 32_000);
  assert.equal(pack.receipt.sources_considered, 4);
  assert.equal(pack.receipt.sources_included, 3);
  assert.ok(pack.receipt.sources_deferred >= 3);
  assert.ok(pack.receipt.deferred_refs.includes('memory:later'));
  assert.deepEqual(pack.receipt.rehydratable_refs, ['tool:high', 'file:high', 'file:low']);
});

test('AgentSam instructions compile in stable then repository-specific precedence', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-instructions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'AGENTSAM.md'), '# Stable\nbase law\n');
  fs.writeFileSync(path.join(root, '.agentsamrules'), '# Repo\nlocal law\n');
  const compiled = compileAgentInstructions(root);
  assert.deepEqual(compiled.precedence, ['AGENTSAM.md', '.agentsamrules']);
  assert.equal(compiled.sources.length, 2);
  assert.ok(compiled.content.indexOf('base law') < compiled.content.indexOf('local law'));
});

test('compatibility shims are not compiled into AgentSam instruction authority', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-instruction-shims-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'AGENTSAM.md'), '# Stable\ncanonical only\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'shim should not become policy\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'claude shim should not become policy\n');
  const compiled = compileAgentInstructions(root);
  assert.equal(compiled.sources.length, 1);
  assert.equal(compiled.sources[0].filename, 'AGENTSAM.md');
  assert.match(compiled.content, /canonical only/);
  assert.doesNotMatch(compiled.content, /shim should not become policy/);
  assert.doesNotMatch(compiled.content, /claude shim should not become policy/);
});

test('project context loads bounded compiled AgentSam instructions', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-context-rules-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'AGENTSAM.md'), '# stable\n' + 'a'.repeat(300));
  fs.writeFileSync(path.join(root, '.agentsamrules'), '# rules\n' + 'x'.repeat(5000) + '\n');
  const pack = resolveProjectContext({
    cwd: root,
    objective: 'inspect repository',
    budget: createContextBudget({ windowTokens: 8_000, maxSystemChars: 1_000, maxEvidenceChars: 1_000 }),
    items: [],
  });
  assert.equal(pack.rules.found, true);
  assert.equal(pack.rules.chars, 1_000);
  assert.equal(pack.rules.truncated, true);
  assert.equal(pack.receipt.system_chars, 1_000);
});

test('consumed tool results compact to 4k while preserving rehydration identity', async () => {
  const { compactConsumedToolResult } = await import('../src/context/index.js');
  const item = compactConsumedToolResult('x'.repeat(10_000), { ref: 'tool:call_123', hash: 'sha256:abc' });
  assert.equal(item.ref, 'tool:call_123');
  assert.equal(item.hash, 'sha256:abc');
  assert.equal(item.chars, 4_000);
  assert.equal(item.compacted, true);
  assert.equal(item.source_chars, 10_000);
});
