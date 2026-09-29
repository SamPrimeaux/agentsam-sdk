import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveCurrentAppContext } from '../src/lib/app-authority.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('generic repo root has no fabricated app identity', () => {
  const context = resolveCurrentAppContext({ root: ROOT, cwd: ROOT });
  assert.deepEqual(context, { app_id: null, host_origin: null, source: null });
});

test('Local Studio context resolves from nearest agentsam.app.json', () => {
  const context = resolveCurrentAppContext({
    root: ROOT,
    cwd: path.join(ROOT, 'apps/local-studio/frontend'),
  });
  assert.equal(context.app_id, 'local-studio');
  assert.equal(context.host_origin, null);
  assert.match(context.source || '', /apps\/local-studio\/agentsam\.app\.json$/);
});

test('package app identity resolves from its own manifest without Local Studio leakage', () => {
  const context = resolveCurrentAppContext({
    root: ROOT,
    cwd: path.join(ROOT, 'packages/agentsam-database-editor/src'),
  });
  assert.equal(context.app_id, 'database-editor');
  assert.equal(context.host_origin, null);
});
