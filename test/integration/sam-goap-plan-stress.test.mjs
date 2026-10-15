import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planGoap } from '../../src/sam/planning/goap.js';

// Seeded world generation; independent Dijkstra oracle, not another A* adapter.
const rng = seed => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
function world(seed) {
  const random = rng(seed), nodes = 5 + seed % 8, edges = [];
  for (let i = 0; i < nodes - 1; i++) edges.push({ id: 'chain_' + i, from: i, to: i + 1, cost: 1 + Math.floor(random() * 10) });
  for (let i = 0; i < nodes * 4; i++) edges.push({
    id: 'edge_' + i, from: Math.floor(random() * nodes),
    to: Math.floor(random() * nodes), cost: 1 + Math.floor(random() * 14)
  });
  return { nodes, edges };
}
function dijkstra(nodes, edges) {
  const distances = Array(nodes).fill(Infinity), used = new Set(); distances[0] = 0;
  for (let i = 0; i < nodes; i++) {
    let u = -1;
    for (let v = 0; v < nodes; v++) if (!used.has(v) && (u < 0 || distances[v] < distances[u])) u = v;
    if (u < 0 || !Number.isFinite(distances[u])) break;
    used.add(u);
    for (const e of edges) if (e.from === u) distances[e.to] = Math.min(distances[e.to], distances[u] + e.cost);
  }
  return distances[nodes - 1];
}
function runPlan(args, repo) {
  const bin = fileURLToPath(new URL('../../bin/agentsam', import.meta.url));
  const proc = spawnSync(process.execPath, [bin, 'plan', ...args, '--cwd', repo, '--json'], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env, NO_COLOR: '1' }
  });
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return JSON.parse(proc.stdout);
}
function freshRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'sam-plan-stress-'));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  return root;
}
test('100 seeded GOAP/A* worlds reproduce optimal Dijkstra cost and action preconditions', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { nodes, edges } = world(seed);
    const input = { initialState: { at: 0 }, goal: { at: nodes - 1 }, maxExpansions: 2000,
      actions: edges.map(e => ({ id: e.id, cost: e.cost, preconditions: { at: e.from }, effects: { at: e.to } })) };
    const serialized = JSON.stringify(input), result = planGoap(input);
    assert.equal(result.status, 'found', 'seed=' + seed);
    assert.equal(result.total_cost, dijkstra(nodes, edges), 'seed=' + seed);
    let at = 0;
    for (const id of result.action_ids) {
      const edge = edges.find(e => e.id === id);
      assert.equal(edge.from, at, 'seed=' + seed);
      at = edge.to;
    }
    assert.equal(at, nodes - 1);
    assert.equal(JSON.stringify(input), serialized, 'planner mutated seed=' + seed);
    assert.deepEqual(planGoap(input).action_ids, result.action_ids, 'nondeterministic seed=' + seed);
  }
});
test('six Git repositories stay isolated; list/show/next never initialize storage', () => {
  const repos = Array.from({ length: 6 }, freshRepo);
  try {
    for (const repo of repos) {
      assert.deepEqual(runPlan(['list'], repo), []);
      assert.equal(runPlan(['show'], repo), null);
      assert.equal(runPlan(['next'], repo).selection, 'uninitialized');
      assert.equal(existsSync(path.join(repo, '.agentsam')), false);
    }
    const created = runPlan(['new', 'Repair canonical CMS theme authority'], repos[0]);
    assert.ok(created.id);
    assert.equal(runPlan(['list'], repos[0]).length, 1);
    for (const other of repos.slice(1)) {
      assert.deepEqual(runPlan(['list'], other), []);
      assert.equal(runPlan(['show', created.id], other), null);
      assert.equal(existsSync(path.join(other, '.agentsam')), false);
    }
  } finally {
    for (const repo of repos) rmSync(repo, { recursive: true, force: true });
  }
});
