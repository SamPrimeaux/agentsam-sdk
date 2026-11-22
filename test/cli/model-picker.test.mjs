import test from 'node:test';
import assert from 'node:assert/strict';
import { curateModels, modelOptions } from '../../src/commands/preferences.js';

const m = (provider, label, created, id = label) => ({ provider, label, provider_model_id: id, metadata: { created_at: created }, capabilities: { agent_runtime: true } });

test('keeps newest version per family and drops non-chat rows', () => {
  const out = curateModels([
    m('anthropic', 'Claude Opus 4.7', '2026-01-01'), m('anthropic', 'Claude Opus 5.5', '2026-10-01'), m('anthropic', 'Claude Opus 5', '2026-08-01'),
    m('gemini', 'Gemini 2.5 Flash Preview TTS', '2026-05-01'), m('gemini', 'Gemini 3.5 Flash', '2026-09-01'), m('gemini', 'Gemini 2.5 Flash', '2026-03-01'),
  ]);
  assert.deepEqual(out.map((x) => x.label), ['Claude Opus 5.5', 'Gemini 3.5 Flash']);
});

test('picker is capped and offers show-all', () => {
  const many = Array.from({ length: 20 }, (_, i) => m('anthropic', `Family${String.fromCharCode(65 + i)} 1`, `2026-01-${String(i + 1).padStart(2, '0')}`));
  const opts = modelOptions({ availableModels: many });
  assert.ok(opts.some((o) => o.value === '__show_all__'));
  assert.ok(opts.length <= 3 + 3);
  assert.ok(modelOptions({ availableModels: many }, { all: true }).length > 15);
});
