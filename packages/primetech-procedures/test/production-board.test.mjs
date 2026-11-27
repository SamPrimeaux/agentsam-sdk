import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProductionBoard, beginGeneration, completeGeneration, failGeneration, getProductionBoard, resumeProductionBoard } from '../src/production-board.js';

async function root(t) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'primetech-board-'));
  t.after(() => fs.rm(value, { recursive: true, force: true }));
  return value;
}

test('production board persists generation receipts, quality gates and resumable failures', async t => {
  const projectRoot = await root(t);
  const created = await createProductionBoard({ projectRoot, title: 'PrimeTech identity', objective: 'Deliver a complete, reusable identity family', brief: 'Build the core icon family and export sources.' });
  assert.equal(created.status, 'active');
  const started = await beginGeneration({ projectRoot, boardId: created.boardId, kind: 'brand.icon-family', brief: 'Create 24 vector variants', prompt: 'Use the approved source SVG.', expectedRevision: created.revision });
  assert.equal(started.status, 'running');
  const review = await completeGeneration({ projectRoot, boardId: created.boardId, generationId: started.generationId, artifacts: [{ ref: 'asset://icons.zip', sha256: 'a'.repeat(64), bytes: 1024 }], qualityChecks: [{ name: 'alpha', status: 'fail' }], expectedRevision: started.revision });
  assert.equal(review.status, 'needs_review');
  const resumable = await resumeProductionBoard({ projectRoot, boardId: created.boardId });
  assert.equal(resumable.resumableCount, 1);
  const completed = await completeGeneration({ projectRoot, boardId: created.boardId, generationId: started.generationId, artifacts: [{ ref: 'asset://icons.zip', sha256: 'a'.repeat(64), bytes: 1024 }], qualityChecks: [{ name: 'alpha', status: 'pass' }, { name: 'render', status: 'pass' }], expectedRevision: review.revision });
  assert.equal(completed.status, 'completed');
  const board = await getProductionBoard({ projectRoot, boardId: created.boardId });
  assert.equal(board.board.generations[0].status, 'completed');
  assert.equal(board.board.generations[0].artifacts.length, 1);
});

test('production board rejects stale revisions and records retryable failures', async t => {
  const projectRoot = await root(t);
  const created = await createProductionBoard({ projectRoot, title: 'Companion', objective: 'Build a companion identity' });
  const started = await beginGeneration({ projectRoot, boardId: created.boardId, kind: 'companion.sprite-atlas', brief: 'Build a sprite atlas' });
  await assert.rejects(() => failGeneration({ projectRoot, boardId: created.boardId, generationId: started.generationId, error: { code: 'stale' }, expectedRevision: created.revision }), /revision_conflict/);
  const failed = await failGeneration({ projectRoot, boardId: created.boardId, generationId: started.generationId, error: { code: 'renderer_unavailable', message: 'Renderer not installed' }, retryable: true, expectedRevision: started.revision });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.retryable, true);
  const resumed = await resumeProductionBoard({ projectRoot, boardId: created.boardId });
  assert.equal(resumed.resumable[0].error.code, 'renderer_unavailable');
});
