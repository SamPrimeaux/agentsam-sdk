import assert from 'node:assert/strict';
import test from 'node:test';
import { Actor, TimelineEvent, WorkGraph, WorkItem } from '../src/index.js';
import { createGitAdapter } from '../src/adapters/engineering/git.js';
import { createMcpAdapter } from '../src/adapters/engineering/mcp.js';
import { createProjectsAdapter } from '../src/adapters/business/projects.js';
import { createTimelineModel } from '../src/renderers/timeline.js';
import { createGanttModel } from '../src/renderers/gantt-model.js';

test('work graph projects one source of truth into timeline and rich Gantt views', () => {
  const actor = new Actor({ id: 'agent-1', name: 'Agent One' });
  const item = new WorkItem({
    id: 'task-1',
    title: 'Index repository',
    owner: actor.id,
    start: '2026-09-18',
    end: '2026-09-19',
    baselineStart: '2026-09-17',
    baselineEnd: '2026-09-18',
    progress: 0.5,
    parentId: 'phase-index',
    estimateMinutes: 120,
    actualMinutes: 70,
    dependencies: ['inventory'],
    artifacts: [{ id: 'artifact-1' }],
    evidence: ['receipt-1'],
    metadata: { summary: 'Repository indexing' },
  });
  const graph = new WorkGraph({ name: 'Release', actors: [actor] });
  graph.add(item);
  graph.events.push(new TimelineEvent({ type: 'deploy', at: '2026-09-19T12:00:00Z', workItemId: item.id }));
  graph.events.push(new TimelineEvent({ type: 'test', at: '2026-09-18T12:00:00Z', workItemId: item.id }));

  const timeline = createTimelineModel(graph);
  assert.equal(timeline.title, 'Release');
  assert.equal(timeline.lanes[0].items[0], item);
  assert.deepEqual(timeline.events.map((event) => event.type), ['test', 'deploy']);

  const gantt = createGanttModel(graph)[0];
  assert.equal(gantt.id, 'task-1');
  assert.equal(gantt.owner.name, 'Agent One');
  assert.equal(gantt.progress, 0.5);
  assert.equal(gantt.parentId, 'phase-index');
  assert.equal(gantt.artifactCount, 1);
  assert.equal(gantt.evidenceCount, 1);
  assert.deepEqual(gantt.dependencies, ['inventory']);
});

test('adapters map source records without fetching or mutating them', () => {
  const commit = { sha: 'abc123', subject: 'Add search', author: 'sam', date: '2026-09-18' };
  const call = { tool_call_id: 'call-1', tool_name: 'search', status: 'complete', receipt_id: 'receipt-1' };
  const project = { id: 'project-1', name: 'CMS', status: 'running', client_id: 'client-1' };
  assert.deepEqual(createGitAdapter().toWorkItems([commit]).map((item) => item.id), ['abc123']);
  assert.deepEqual(createMcpAdapter().toWorkItems([call])[0].evidence, ['receipt-1']);
  assert.equal(createProjectsAdapter().toWorkItems([project])[0].owner, 'client-1');
  assert.deepEqual(commit, { sha: 'abc123', subject: 'Add search', author: 'sam', date: '2026-09-18' });
});
