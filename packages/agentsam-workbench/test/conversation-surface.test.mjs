import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('conversation surface owns one persistent composer slot', async () => {
  const source = await readFile(
    new URL('../src/agent/AgentConversationSurface.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /data-agent-conversation-composer/);
  assert.match(source, /\{composer\}/);
  assert.doesNotMatch(source, /empty\s*\?[^:]*composer/s);
  assert.doesNotMatch(source, /data-agent-conversation-spacer/);
  assert.match(source, /data-agent-conversation-body-empty/);
});

test('lead Local Studio conversation mounts one composer through the reusable surface', async () => {
  const source = await readFile(
    new URL('../../../apps/local-studio/frontend/agentsam/AgentSamPage.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /AgentConversationSurface/);
  assert.match(source, /AgentRuntimeField/);
  assert.equal((source.match(/<Composer\b/g) ?? []).length, 1);
});

test('co-worker conversation also uses the same persistent surface', async () => {
  const source = await readFile(
    new URL('../../../apps/local-studio/frontend/src/components/workbench/side-stage.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /function CoworkerChat/);
  assert.match(source, /<AgentConversationSurface/);
  assert.match(source, /AgentRuntimeField/);
  assert.match(source, /targetKind="side"/);
});

test('thread primitive has a safe standalone scroll contract', async () => {
  const source = await readFile(
    new URL('../src/agent/Thread.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /minHeight: 0/);
  assert.match(source, /overflowY: 'auto'/);
});

test('legacy Local Studio TrailThread also uses the portable conversation surface', async () => {
  const source = await readFile(
    new URL('../../../apps/local-studio/frontend/src/components/workbench/thread.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /AgentConversationSurface/);
  assert.match(source, /AgentRuntimeField/);
});


test('composer exposes the canonical semantic run mode', async () => {
  const source = await readFile(
    new URL('../src/agent/Composer.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /AgentRunMode/);
  assert.match(source, /data-agent-mode=\{runMode\}/);
});
