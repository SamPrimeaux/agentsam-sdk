import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAnimateTerminal,
  createRuntimeActivity,
  phaseForRuntimeEvent,
  renderRuntimeActivityFrame,
  renderRuntimeActivityPanel,
  renderRuntimeActivityResult,
} from '../src/ui/runtime-activity.js';
import { runLocalAgent } from '../src/commands/shell.js';

test('runtime activity is automatic only in a real interactive terminal', () => {
  assert.equal(canAnimateTerminal({ stdout: { isTTY: true }, env: { TERM: 'xterm-256color' } }), true);
  assert.equal(canAnimateTerminal({ stdout: { isTTY: false }, env: { TERM: 'xterm-256color' } }), false);
  assert.equal(canAnimateTerminal({ stdout: { isTTY: true }, env: { TERM: 'dumb' } }), false);
  assert.equal(canAnimateTerminal({ stdout: { isTTY: true }, env: { TERM: 'xterm-256color', CI: '1' } }), false);
});

test('runtime renderer exposes thinking, tool, and context phases without product renderer vocabulary', () => {
  assert.match(renderRuntimeActivityFrame({ phase: 'thinking', tick: 1, elapsedMs: 1250 }), /Agent Sam/);
  assert.match(renderRuntimeActivityFrame({ phase: 'thinking', tick: 1, elapsedMs: 1250 }), /thinking/);
  const panel = renderRuntimeActivityPanel({ phase: 'thinking', tick: 2, elapsedMs: 1250 });
  assert.match(panel, /Agent Sam/);
  assert.match(panel, /thinking · working locally/);
  assert.match(panel, /\(●\)/);
  assert.equal(panel.split('\n').length, 5);
  assert.match(renderRuntimeActivityResult({ phase: 'done', elapsedMs: 1250 }), /done/);
  assert.equal(phaseForRuntimeEvent({ type: 'model.started' }), 'thinking');
  assert.equal(phaseForRuntimeEvent({ type: 'tool.started', tool: 'git.status' }), 'using git.status');
  assert.equal(phaseForRuntimeEvent({ type: 'context.compaction.started' }), 'tidying context');
});

test('runtime activity redraws automatically and restores the cursor', () => {
  let output = '';
  let clock = 0;
  let intervalFn = null;
  const activity = createRuntimeActivity({
    write: (text) => { output += text; },
    interactive: true,
    now: () => clock,
    setInterval: (fn) => { intervalFn = fn; return 7; },
    clearInterval: () => {},
  });

  activity.start('thinking');
  clock = 320;
  intervalFn();
  activity.update('using repository.snapshot');
  clock = 840;
  activity.succeed('done');

  assert.match(output, /thinking/);
  assert.match(output, /using repository\.snapshot/);
  assert.match(output, /done/);
  assert.match(output, /\x1b\[\?25l/);
  assert.match(output, /\x1b\[\?25h/);
});

test('/agent starts and completes product activity around the real request', async () => {
  const phases = [];
  let output = '';
  const activity = {
    start: (phase) => phases.push(`start:${phase}`),
    succeed: (phase) => phases.push(`success:${phase}`),
    fail: (phase) => phases.push(`fail:${phase}`),
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async text() { return JSON.stringify({ ok: true, answer: 'ready' }); },
  });

  await runLocalAgent('inspect this repo', (text) => { output += text; }, { fetchImpl, activity, interactive: true });
  assert.deepEqual(phases, ['start:thinking', 'success:done']);
  assert.match(output, /"answer": "ready"/);
});


test('/agent restores product activity when the response body fails', async () => {
  const phases = [];
  const activity = {
    start: (phase) => phases.push(`start:${phase}`),
    succeed: (phase) => phases.push(`success:${phase}`),
    fail: (phase) => phases.push(`fail:${phase}`),
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async text() { throw new Error('body interrupted'); },
  });

  await assert.rejects(
    runLocalAgent('inspect this repo', () => {}, { fetchImpl, activity, interactive: true }),
    /response could not be read: body interrupted/,
  );
  assert.deepEqual(phases, ['start:thinking', 'fail:response error']);
});
