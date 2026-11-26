import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  autoLayoutWorkflowNodes,
  createWorkflowNodeKey,
  resolveWorkflowNodePositions,
  validateWorkflowGraph,
} from '../dist/workflows/model.js';

const node = (nodeKey, kind = 'branch', ui = {}) => ({
  nodeKey,
  kind,
  title: nodeKey,
  ui,
});

const graph = (overrides = {}) => ({
  id: 'wf_test',
  workflowKey: 'test.workflow',
  revision: 1,
  scopeType: 'account',
  displayName: 'Test workflow',
  lifecycle: 'draft',
  entryNodeKey: 'start',
  nodes: [node('start'), node('finish', 'output')],
  edges: [{ fromNodeKey: 'start', toNodeKey: 'finish', conditionType: 'always' }],
  ...overrides,
});

test('workflow auto layout follows graph dependency order and is deterministic', () => {
  const nodes = [node('start'), node('left'), node('right'), node('finish', 'output')];
  const edges = [
    { fromNodeKey: 'start', toNodeKey: 'left', conditionType: 'always' },
    { fromNodeKey: 'start', toNodeKey: 'right', conditionType: 'always' },
    { fromNodeKey: 'left', toNodeKey: 'finish', conditionType: 'always' },
    { fromNodeKey: 'right', toNodeKey: 'finish', conditionType: 'always' },
  ];
  const first = autoLayoutWorkflowNodes(nodes, edges);
  const second = autoLayoutWorkflowNodes(nodes, edges);
  assert.deepEqual(first, second);
  assert.ok(first.start.x < first.left.x);
  assert.ok(first.start.x < first.right.x);
  assert.ok(first.finish.x > first.left.x);
  assert.notDeepEqual(first.left, first.right);
});

test('saved canvas positions override automatic positions', () => {
  const positions = resolveWorkflowNodePositions([
    node('start', 'branch', { position: { x: 480, y: 220 } }),
    node('finish', 'output'),
  ], [{ fromNodeKey: 'start', toNodeKey: 'finish', conditionType: 'always' }]);
  assert.deepEqual(positions.start, { x: 480, y: 220 });
  assert.ok(Number.isFinite(positions.finish.x));
});

test('drafts may omit entry node but activation cannot', () => {
  const draft = validateWorkflowGraph(graph({ entryNodeKey: null }));
  assert.equal(draft.ok, true);
  assert.equal(draft.issues[0].severity, 'warning');
  const activation = validateWorkflowGraph(graph({ entryNodeKey: null }), { forActivation: true });
  assert.equal(activation.ok, false);
  assert.equal(activation.issues[0].code, 'workflow_entry_node_required');
});

test('action nodes require exactly one valid resolution path', () => {
  const invalid = graph({ nodes: [node('start', 'action'), node('finish', 'output')] });
  const result = validateWorkflowGraph(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'workflow_action_resolution_required'));
  const routed = graph({ nodes: [{ ...node('start', 'action'), resolutionMode: 'routed', capabilityKey: 'repo.read' }, node('finish', 'output')] });
  assert.equal(validateWorkflowGraph(routed).ok, true);
  const pinned = graph({ nodes: [{ ...node('start', 'action'), resolutionMode: 'pinned', capabilityKey: 'repo.read', pinnedToolId: 'tool_1' }, node('finish', 'output')] });
  assert.equal(validateWorkflowGraph(pinned).ok, true);
});

test('edge endpoints and duplicate graph connections are checked', () => {
  const invalid = graph({
    edges: [
      { fromNodeKey: 'missing', toNodeKey: 'finish', conditionType: 'always' },
      { fromNodeKey: 'start', toNodeKey: 'finish', conditionType: 'always', priority: 0 },
      { fromNodeKey: 'start', toNodeKey: 'finish', conditionType: 'always', priority: 0 },
    ],
  });
  const result = validateWorkflowGraph(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'workflow_edge_source_missing'));
  assert.ok(result.issues.some((issue) => issue.code === 'workflow_edge_duplicate'));
});

test('node keys avoid collisions without requiring a host route or runtime', () => {
  assert.equal(createWorkflowNodeKey('action', ['action-1']), 'action-2');
  assert.equal(createWorkflowNodeKey('branch', []), 'branch-1');
});

test('workflow editor is exported as a host-mounted UI package surface', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.exports['./workflows']);
  assert.ok(pkg.exports['./workflows/workflow-studio.css']);
  assert.ok(existsSync(new URL('../dist/workflows/index.js', import.meta.url)));
  assert.ok(existsSync(new URL('../dist/workflows/workflow-studio.css', import.meta.url)));
  const source = readFileSync(new URL('../src/workflows/WorkflowStudio.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /\/api\//);
  assert.match(source, /host\?\.saveDraft/);
  assert.match(source, /host\?\.run/);
});
