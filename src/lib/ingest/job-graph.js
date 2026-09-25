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
  syncWorkItems(next);
  const allDone = next.nodes.every((n) => n.status === 'done' || n.status === 'skipped');
  next.status = allDone ? 'completed' : 'running';
  return next;
}

/**
 * After a successful dry-run: freeze remaining nodes as planned (not "run").
 * Prevents `→ ast.parse` looking like the CLI is waiting for another command.
 *
 * @param {ReturnType<typeof createCodebaseindexJobGraph>} graph
 * @param {{ skipEmbedding?: boolean }} [opts]
 */
export function freezePlanJobGraph(graph, opts = {}) {
  const next = structuredClone(graph);
  next.updated_at = new Date().toISOString();
  next.status = 'planned';
  for (const node of next.nodes) {
    if (node.status === 'done') continue;
    if (opts.skipEmbedding && node.id === 'embedding.generate') {
      node.status = 'skipped';
      node.completed_at = next.updated_at;
      continue;
    }
    // Clear accidental "run" pointer from advanceJobGraph
    node.status = 'planned';
    node.started_at = null;
  }
  syncWorkItems(next);
  return next;
}

/**
 * Human projection of the job graph for CLI notes.
 * @param {ReturnType<typeof createCodebaseindexJobGraph>} graph
 * @param {{ planOnly?: boolean }} [opts]
 */
export function formatJobGraphHuman(graph, opts = {}) {
  const lines = [];
  const planned = [];
  for (const n of graph.nodes || []) {
    if (n.status === 'done') lines.push(`✓ ${n.id}`);
    else if (n.status === 'skipped') lines.push(`⊘ ${n.id}   skipped`);
    else if (opts.planOnly || n.status === 'planned' || graph.status === 'planned') {
      planned.push(n.id);
    } else if (n.status === 'run') lines.push(`→ ${n.id}`);
    else lines.push(`· ${n.id}`);
  }
  if (planned.length) {
    lines.push('');
    lines.push('PLANNED FOR RUN');
    for (const id of planned) lines.push(`○ ${id}`);
  }
  return lines.join('\n');
}

function syncWorkItems(graph) {
  graph.work_items = graph.nodes.map((n) => ({
    id: n.id,
    title: n.id,
    status: n.status === 'done' || n.status === 'skipped' ? 'completed'
      : n.status === 'run' ? 'in_progress'
        : n.status === 'planned' ? 'planned'
          : 'pending',
    start: n.started_at,
    end: n.completed_at,
  }));
}
