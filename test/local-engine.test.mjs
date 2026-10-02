import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  LocalEngineRegistry,
  adoptAsset,
  auditAssets,
  auditLocalCompute,
  createLlamaCppEngine,
  createMlxLmEngine,
  createOllamaEngine,
  validateStructuredOutput,
} from '../src/local-engine/index.js';

test('local engine registry exposes the portable engine contract', () => {
  const registry = new LocalEngineRegistry([createOllamaEngine({ env: {}, fetchImpl: async () => new Response('{}', { status: 500 }) })]);
  assert.deepEqual(registry.list(), ['ollama']);
  for (const method of ['discover', 'capabilities', 'chat', 'embed', 'unload']) assert.equal(typeof registry.get('ollama')[method], 'function');
});

test('local engine adapters are capability-shaped and portable', () => {
  assert.equal(createMlxLmEngine({ endpoint: 'http://127.0.0.1:9999' }).id, 'mlx-lm');
  assert.equal(createLlamaCppEngine({ endpoint: 'http://127.0.0.1:9998' }).id, 'llama.cpp');
});

test('structured output validation reports parse and schema validity separately', () => {
  assert.equal(validateStructuredOutput('{"answer":"ok"}', { type: 'object', required: ['answer'] }).valid, true);
  assert.equal(validateStructuredOutput('{"wrong":true}', { type: 'object', required: ['answer'] }).schema_error, 'missing_required:answer');
  assert.equal(validateStructuredOutput('{bad}', { type: 'object' }).parse_error !== null, true);
});

test('compute audit is read-only and honest on non-Apple hosts', () => {
  const result = auditLocalCompute({ platform: 'linux', arch: 'x64' });
  assert.equal(result.schema_version, 'agentsam.compute.audit.v1');
  assert.equal(result.hardware.memory.vram_bytes, null);
  assert.equal(result.hardware.apple_silicon, false);
});

test('asset adoption records an external reference without copying weights', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-assets-'));
  const env = { ...process.env, AGENTSAM_HOME: path.join(root, '.agentsam') };
  const model = path.join(root, 'model.gguf');
  fs.writeFileSync(model, 'fixture-weight');
  const result = adoptAsset(model, { engine_id: 'llama.cpp', model: 'fixture' }, { env });
  assert.equal(result.copied, false);
  assert.equal(result.asset.reference, 'external');
  assert.equal(auditAssets({ env }).assets[0].exists, true);
});
