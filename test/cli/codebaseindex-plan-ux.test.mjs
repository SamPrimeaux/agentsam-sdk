import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCodebaseindexJobGraph,
  advanceJobGraph,
  freezePlanJobGraph,
  formatJobGraphHuman,
} from '../../src/indexing/ingest/job-graph.js';
import { classifyTopLevel } from '../../src/indexing/ingest/inventory.js';

describe('codebaseindex job graph plan freeze', () => {
  it('does not leave → run pointer after plan.dry_run', () => {
    let g = createCodebaseindexJobGraph();
    g = advanceJobGraph(g, 'plan.dry_run');
    assert.equal(g.nodes.find((n) => n.status === 'run')?.id, 'ast.parse');
    g = freezePlanJobGraph(g, { skipEmbedding: true });
    assert.equal(g.status, 'planned');
    assert.equal(g.nodes.filter((n) => n.status === 'run').length, 0);
    assert.equal(g.nodes.find((n) => n.id === 'embedding.generate')?.status, 'skipped');
    const text = formatJobGraphHuman(g, { planOnly: true });
    assert.match(text, /PLANNED FOR RUN/);
    assert.match(text, /○ ast\.parse/);
    assert.doesNotMatch(text, /→/);
  });
});

describe('inventory path categories', () => {
  it('classifies source vs dependencies vs generated', () => {
    assert.equal(classifyTopLevel('src'), 'source');
    assert.equal(classifyTopLevel('apps'), 'source');
    assert.equal(classifyTopLevel('docs'), 'docs');
    assert.equal(classifyTopLevel('node_modules'), 'dependencies');
    assert.equal(classifyTopLevel('dist'), 'dependencies');
    assert.equal(classifyTopLevel('generated'), 'generated');
    assert.equal(classifyTopLevel('.agentsam'), 'config');
  });
});
