import assert from 'node:assert/strict';
import test from 'node:test';
import * as acp from '../../src/acp/index.js';

test('SDK ACP public surface exposes portable host, client, hooks execution, and runtime selection', () => {
  for (const name of [
    'DatabaseAgentControlClient',
    'LocalAgentControlClient',
    'HttpAgentControlClient',
    'createAgentControlClient',
    'createAgentControlHttpHandler',
    'createRootRun',
    'spawnChildRun',
    'reconcileParentAfterChildTerminal',
    'createAgentRunJobHandler',
    'selectRuntimeCandidate',
    'createRuntimeSelector',
  ]) {
    assert.equal(typeof acp[name], 'function', name);
  }
});
