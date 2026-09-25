/**
 * codebaseindex.job.graph.v1 — portable job graph for CLI / Gantt / Studio.
 */

import { randomUUID } from 'node:crypto';

export const JOB_GRAPH_SCHEMA = 'codebaseindex.job.graph.v1';

const DEFAULT_NODES = [
  'material.stage',
  'repository.snapshot',
  'inventory.classify',
  'scope.resolve',
  'profile.resolve',
  'lane.resolve',
  'plan.dry_run',
  'ast.parse',
  'chunks.build',
  'embedding.generate',
  'storage.write',
  'generation.verify',
  'search.smoke',
];

/**
 * @param {object} [opts]
 */
export function createCodebaseindexJobGraph(opts = {}) {
  const id = opts.id || `cidxjob_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const nodes = (opts.nodes || DEFAULT_NODES).map((nodeId, index) => ({
    id: nodeId,
    status: opts.completed?.includes(nodeId) ? 'done'
      : opts.current === nodeId ? 'run'
        : 'pending',
    ordinal: index,
    started_at: null,
    completed_at: null,
    inputs: {},
    outputs: {},
    errors: [],
  }));
  return {
    schema: JOB_GRAPH_SCHEMA,
    id,
    pipeline: 'sam.codebaseindex.index.run',
    operation: 'codebaseindex.ingest',
    created_at: now,
    updated_at: now,
    status: opts.status || 'planned',
    nodes,
    work_items: nodes.map((n) => ({
      id: n.id,
      title: n.id,
      status: n.status === 'done' ? 'completed' : n.status === 'run' ? 'in_progress' : 'pending',
      start: null,
      end: null,
    })),
  };
}

/**
 * Mark nodes through `throughId` as done; set next as run (or complete).
 * @param {ReturnType<typeof createCodebaseindexJobGraph>} graph
 * @param {string} throughId
 */
export function advanceJobGraph(graph, throughId) {
  const next = structuredClone(graph);
  next.updated_at = new Date().toISOString();
  let found = false;
  for (const node of next.nodes) {
    if (!found) {
      node.status = 'done';
      node.completed_at = next.updated_at;
      if (node.id === throughId) found = true;
    } else if (node.status === 'pending') {
      node.status = 'run';
      node.started_at = next.updated_at;
      break;
    }
  }
  next.work_items = next.nodes.map((n) => ({
    id: n.id,
    title: n.id,
    status: n.status === 'done' ? 'completed' : n.status === 'run' ? 'in_progress' : 'pending',
    start: n.started_at,
    end: n.completed_at,
  }));
  const allDone = next.nodes.every((n) => n.status === 'done');
  next.status = allDone ? 'completed' : 'running';
  return next;
}
