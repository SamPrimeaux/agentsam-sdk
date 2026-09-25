import assert from 'node:assert/strict';
import test from 'node:test';
import { renderArchitectureExplorer, renderOperationInspector, drawBox } from '../../src/ui/wireframes.js';
import { buildGoProductRegistrySql } from '../../src/go/registry.js';

test('architecture explorer is boxed reasoning scenery', () => {
  const view = renderArchitectureExplorer({
    repo: 'agentsam-sdk',
    focus: { package: 'protocol', owns: 'wire contracts', runtime: 'none', imported_by: 'client', files: '.proto' },
  });
  assert.match(view, /┌/);
  assert.match(view, /package: protocol/);
  assert.match(view, /DEPENDENCY MAP/);
  assert.match(view, /\[contracts\]/);
});

test('operation inspector shows intent timeline', () => {
  const view = renderOperationInspector({
    operation: 'model.export',
    op_id: 'op_01H',
    active_index: 2,
    step: { name: 'converter', artifact: 'GLB' },
    receipt: { 'input document revision': 84, 'output artifact hash': 'abc' },
  });
  assert.match(view, /model\.export/);
  assert.match(view, /intent/);
  assert.match(view, /converter/);
  assert.match(view, /GLB/);
  assert.match(view, /input document revision/);
});

test('drawBox pads visible ANSI width', () => {
  const box = drawBox(['hello'], { width: 20, title: 't' });
  assert.match(box, /┌/);
  assert.match(box, /└/);
});

test('buildGoProductRegistrySql upserts product + relationships without inventing tables', () => {
  const sql = buildGoProductRegistrySql({
    product: 'agentsam-go-worker',
    status: 'deployed',
    url: 'https://agentsam-go-worker.example.workers.dev',
    commit: 'abc123',
    health: 'healthy',
  });
  assert.match(sql, /INSERT INTO agentsam_products/);
  assert.match(sql, /ON CONFLICT\(slug\) DO UPDATE/);
  assert.match(sql, /INSERT INTO asset_relationships/);
  assert.match(sql, /sourced_from/);
  assert.match(sql, /runs_on/);
  assert.match(sql, /deployed_as/);
  assert.doesNotMatch(sql, /CREATE TABLE/);
  assert.doesNotMatch(sql, /account_id/);
});
