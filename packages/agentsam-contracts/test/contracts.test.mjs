import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as contracts from '../dist/index.js';

test('contracts package stays framework neutral', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
});

test('operation and tool contracts are first-class package exports', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const key of ['./tools', './operations', './authority', './execution', './providers', './events', './run', './hooks', './widgets']) {
    const entry = pkg.exports[key];
    assert.equal(typeof entry, 'object', `missing typed contract export: ${key}`);
    assert.match(entry.types, /^\.\/dist\/.+\.d\.ts$/);
    assert.match(entry.import, /^\.\/dist\/.+\.js$/);
  }
  for (const key of [
    './schemas/sam-operation.v1.schema.json',
    './schemas/agent-tool-definition.v1.schema.json',
    './schemas/sam-result.v1.schema.json',
  ]) {
    assert.equal(typeof pkg.exports[key], 'string', `missing portable schema export: ${key}`);
    assert.ok(pkg.files.includes('schemas'), 'package must publish its source schemas');
  }
});

test('protocol operation, tool and result schemas are exact package-owned mirrors', async () => {
  const pairs = [
    ['../schemas/sam-operation.v1.schema.json', '../../../protocol/sam/operation.schema.json'],
    ['../schemas/sam-result.v1.schema.json', '../../../protocol/sam/result.schema.json'],
    ['../schemas/agent-tool-definition.v1.schema.json', '../../../protocol/tools/agent-tool-definition.v1.schema.json'],
  ];
  for (const [source, mirror] of pairs) {
    const canonical = JSON.parse(await readFile(new URL(source, import.meta.url), 'utf8'));
    const published = JSON.parse(await readFile(new URL(mirror, import.meta.url), 'utf8'));
    assert.deepEqual(published, canonical, `protocol mirror drift: ${mirror}`);
  }
});

test('JSON Schema enums and TypeScript/runtime vocabularies cannot drift', async () => {
  const readSchema = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  const operation = await readSchema('../schemas/sam-operation.v1.schema.json');
  const tool = await readSchema('../schemas/agent-tool-definition.v1.schema.json');
  const result = await readSchema('../schemas/sam-result.v1.schema.json');
  const execution = operation.properties.execution.properties;

  assert.deepEqual(execution.lanes.items.enum, contracts.AGENT_OPERATION_LANES);
  assert.deepEqual(execution.model.enum, contracts.AGENT_OPERATION_MODEL_POLICIES);
  assert.deepEqual(execution.network.enum, contracts.AGENT_OPERATION_NETWORK_POLICIES);
  assert.deepEqual(execution.sideEffects.enum, contracts.AGENT_OPERATION_SIDE_EFFECTS);
  assert.deepEqual(operation.properties.risk.enum, contracts.AGENT_OPERATION_RISKS);
  assert.deepEqual(operation.properties.status.enum, contracts.AGENT_OPERATION_STATUSES);
  assert.deepEqual(operation.properties.idempotencyMode.enum, contracts.AGENT_OPERATION_IDEMPOTENCY_MODES);
  assert.deepEqual(operation.$defs.authorityRequirement.properties.type.enum, contracts.AGENT_AUTHORITY_TYPES);
  assert.deepEqual(result.properties.receipt.properties.execution.properties.lane.enum, contracts.AGENT_OPERATION_LANES);

  assert.deepEqual(tool.properties.riskLevel.enum, contracts.AGENT_TOOL_RISK_LEVELS);
  assert.deepEqual(tool.properties.sideEffectLevel.enum, contracts.AGENT_TOOL_SIDE_EFFECT_LEVELS);
  assert.deepEqual(tool.properties.idempotencyMode.enum, contracts.AGENT_TOOL_IDEMPOTENCY_MODES);
  assert.deepEqual(tool.properties.receiptMode.enum, contracts.AGENT_TOOL_RECEIPT_MODES);
  assert.deepEqual(tool.properties.handler.properties.type.enum, contracts.AGENT_TOOL_HANDLER_TYPES);
  assert.deepEqual(tool.properties.authority.items.properties.type.enum, contracts.AGENT_AUTHORITY_TYPES);
});

test('packaged tool guard enforces the portable AgentToolDefinition shape', () => {
  const valid = {
    toolKey:'sample.read',
    displayName:'Sample read',
    capabilityKey:'sample.read',
    inputSchema:{type:'object'},
    outputSchema:{type:'object'},
    riskLevel:'low',
    sideEffectLevel:'none',
    idempotencyMode:'intrinsic',
  };
  assert.doesNotThrow(() => contracts.assertAgentToolDefinition(valid));
  assert.throws(
    () => contracts.assertAgentToolDefinition({...valid, riskLevel:'unclassified'}),
    /invalid riskLevel/,
  );
  assert.throws(
    () => contracts.assertAgentToolDefinition({...valid, authority:[{type:'unknown'}]}),
    /invalid authority type/,
  );
  assert.throws(
    () => contracts.assertAgentToolDefinition({...valid, extraField:true}),
    /unknown definition field/,
  );
});
