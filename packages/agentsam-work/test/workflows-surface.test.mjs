import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Work package exports the host-driven workflow library surface', async () => {
  const source = await readFile(new URL('../dist/frontend/index.js', import.meta.url), 'utf8');
  assert.match(source, /WorkflowsSurface/);
});

test('workflow library surface does not define routes, fetch, or fixture records', async () => {
  const source = await readFile(new URL('../src/frontend/surfaces/WorkflowsSurface.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /href\s*=/);
  assert.doesNotMatch(source, /\/api\//);
  assert.doesNotMatch(source, /fixture|mockWorkflow|sampleWorkflow/i);
  assert.match(source, /onOpen\?/);
  assert.match(source, /onRun\?/);
});

test('WorkProduct mounts workflows through the existing Work surface and host callbacks', async () => {
  const product = await readFile(new URL('../src/frontend/WorkProduct.tsx', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../src/frontend/WorkShell.tsx', import.meta.url), 'utf8');
  const contracts = await readFile(new URL('../src/contracts/index.ts', import.meta.url), 'utf8');
  assert.match(product, /surface === "workflows"/);
  assert.match(product, /items=\{snapshot\.workflows \?\? \[\]\}/);
  assert.match(product, /host\.createWorkflowDraft/);
  assert.match(product, /host\.openWorkflow/);
  assert.match(product, /host\.runWorkflow/);
  assert.match(shell, /workflows: Workflow/);
  assert.match(shell, /surface === "workflows"\) return "workflows"/);
  assert.match(contracts, /\| "workflows"/);
  assert.match(contracts, /workflows\?: WorkWorkflowSummary\[\]/);
  assert.doesNotMatch(product, /"\/workflows"|`\/workflows/);
});
