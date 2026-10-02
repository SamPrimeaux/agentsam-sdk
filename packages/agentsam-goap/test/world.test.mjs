import assert from 'node:assert/strict';
import test from 'node:test';
import { projectGoapWorld, projectPlanActions } from '../src/world.js';

const plan = {
  id: 'plan_1',
  title: 'Ship portable loop',
  status: 'active',
  tasks_done: 1,
  tasks_total: 3,
  tasks: [
    {
      id: 'todo_done',
      title: 'Freeze contract',
      status: 'complete',
      priority: 'high',
      sort_order: 10,
      metadata: { kind: 'decision', depends_on: [] },
    },
    {
      id: 'todo_active',
      title: 'Project world',
      status: 'running',
      priority: 'critical',
      sort_order: 20,
      metadata: { kind: 'implement', depends_on: ['todo_done'], acceptance: [], evidence: [] },
    },
    {
      id: 'todo_next',
      title: 'Verify loop',
      status: 'open',
      priority: 'high',
      sort_order: 30,
      metadata: { kind: 'verify', depends_on: ['todo_active'] },
    },
  ],
};

test('projectPlanActions converts TODO dependencies into GOAP preconditions', () => {
  const actions = projectPlanActions(plan);
  assert.equal(actions.available.length, 0);
  assert.equal(actions.blocked.length, 1);
  assert.equal(actions.blocked[0].id, 'todo_next');
  assert.equal(actions.blocked[0].blockers[0].id, 'todo_active');
  assert.deepEqual(actions.blocked[0].spec.preconditions[0], {
    fact: 'todo.complete',
    todo_id: 'todo_active',
    value: true,
  });
});

test('projectGoapWorld emits canonical world, blackboard, goal, and action contracts', () => {
  const world = projectGoapWorld({
    repository: {
      repository_id: 'github:example/repo',
      branch: 'main',
      revision_sha: 'abc123',
      dirty: false,
      merkle_root: 'sha256:merkle',
    },
    plan,
    activeTodo: plan.tasks[1],
    knowledge: { status: 'current', generation_id: 'gen_1' },
    evidence: { primitive: 'repository.audit', chars: 900 },
    revision: 7,
    updatedAt: 123,
  });

  assert.equal(world.schema, 'agentsam.goap.world.v1');
  assert.equal(world.blackboard.schema, 'agentsam.blackboard.v1');
  assert.equal(world.blackboard.current_goal_id, 'todo_active');
  assert.equal(world.blackboard.revision, 7);
  assert.equal(world.blackboard.state.repository.merkle_root, 'sha256:merkle');
  assert.equal(world.goal.schema, 'agentsam.goal.v1');
  assert.equal(world.goal.id, 'todo_active');
  assert.equal(world.goal.status, 'active');
  assert.equal(world.goal.spec.desired[0].fact, 'todo.complete');
  assert.equal(world.actions.blocked[0].id, 'todo_next');
});
