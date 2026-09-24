import test from 'node:test';
import assert from 'node:assert/strict';
import { compileToolSchema, restoreOptionalArguments } from '../../src/providers/tool-schema.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { createOpenAIResponsesAdapter } from '../../src/providers/openai-responses.js';
import { createGeminiGenerateContentAdapter } from '../../src/providers/gemini-generate-content.js';

const canonical = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'sample', type: 'object', properties: {
  text: { type: 'string' }, rows: { type: 'array', items: { type: 'object', properties: { label: { type: 'string', enum: ['x'] } } } },
  additionalProperties: { type: 'string' },
}, required: ['text'] };

test('strict compiler recursively closes objects and makes omitted fields nullable without mutating canonical input', () => {
  const original = structuredClone(canonical);
  const { providerSchema: s } = compileToolSchema({ provider: 'openai', canonicalSchema: canonical });
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required, ['text', 'rows', 'additionalProperties']);
  assert.equal(s.properties.rows.anyOf[0].items.additionalProperties, false);
  assert.deepEqual(s.properties.rows.anyOf[0].items.required, ['label']);
  assert.deepEqual(s.properties.rows.anyOf[0].items.properties.label.anyOf, [{ type: 'string', enum: ['x'] }, { type: 'null' }]);
  assert.deepEqual(canonical, original);
  assert.deepEqual(restoreOptionalArguments({ text: 'x', rows: [{ label: null }], additionalProperties: null }, canonical), { text: 'x', rows: [{}] });
});

test('all executable capability schemas compile for both providers, including actual knowledge.search arguments', () => {
  for (const descriptor of createCapabilityAdapter().toolDescriptors()) {
    for (const provider of ['openai', 'gemini']) assert.ok(compileToolSchema({ provider, canonicalSchema: descriptor.input_schema, strict: descriptor.strict !== false, name: descriptor.name }).hash);
    if (descriptor.name === 'knowledge.search') assert.equal(descriptor.input_schema.properties.text.type, 'string');
  }
});

test('bad schemas fail before provider fetch, with actionable paths', async () => {
  for (const schema of [
    { type: 'object', properties: {}, required: ['missing'] },
    { type: 'object', properties: { x: { $ref: 'https://remote/schema' } } },
    { type: 'object', properties: { x: { type: 'array' } } },
    { type: 'object', properties: { x: { type: 'invalid' } } },
  ]) {
    let requests = 0;
    const adapter = createOpenAIResponsesAdapter({ apiKey: 'test', fetchImpl: async () => { requests++; } });
    await assert.rejects(adapter.create({ model: 'gpt-6-astra', input: 'test', tools: [{ type: 'function', name: 'broken', parameters: schema }] }), /tool_schema_invalid:openai:broken:/);
    assert.equal(requests, 0);
  }
});

test('Gemini uses JSON Schema declaration field and preserves canonical optionality', async () => {
  let body;
  const adapter = createGeminiGenerateContentAdapter({ apiKey: 'test', fetchImpl: async (_, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }] }) };
  } });
  await adapter.create({ modelRecord: { provider: 'gemini', provider_model_id: 'fixture' }, input: 'test', tools: [{ name: 'sample', parameters: canonical }] });
  const declaration = body.tools[0].functionDeclarations[0];
  assert.equal(declaration.parameters, undefined);
  assert.equal(declaration.parametersJsonSchema.$schema, undefined);
  assert.equal(declaration.parametersJsonSchema.$id, undefined);
  assert.deepEqual(declaration.parametersJsonSchema.required, ['text']);
  assert.equal(declaration.parametersJsonSchema.properties.additionalProperties.type, 'string');
});
