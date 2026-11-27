import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureProjectDirectory, safeSlug, writeJsonAtomic } from './creative/paths.js';

const BOARD_SCHEMA = 'agentsam.primetech.production-board.v1';
const GENERATION_STATUSES = new Set(['queued', 'running', 'needs_review', 'completed', 'failed', 'cancelled']);

function id(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
function boardPath(root, boardId) {
  if (typeof boardId !== 'string' || !/^ptb_[a-f0-9]{24}$/.test(boardId)) throw new Error('production_board_id_invalid');
  return path.join(root, 'boards', `${boardId}.json`);
}

async function withBoardLock(filePath, operation) {
  const lockPath = `${filePath}.lock`;
  let handle;
  try {
    handle = await fs.open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('production_board_locked');
    throw error;
  }
  try { return await operation(); }
  finally {
    await handle?.close().catch(() => {});
    await fs.rm(lockPath, { force: true }).catch(() => {});
  }
}

async function readBoardFile(filePath) {
  let board;
  try { board = JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') throw new Error('production_board_not_found'); throw new Error('production_board_corrupt'); }
  if (board.schema !== BOARD_SCHEMA || !Array.isArray(board.generations) || !Number.isInteger(board.revision)) throw new Error('production_board_corrupt');
  return board;
}

async function saveBoard(filePath, board, expectedRevision) {
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== board.revision) throw new Error(`production_board_revision_conflict:${board.revision}`);
  board.revision += 1;
  board.updatedAt = new Date().toISOString();
  await writeJsonAtomic(filePath, board);
  return board;
}

export async function createProductionBoard({ projectRoot, title, objective, brief = '', projectId = null, tags = [] } = {}) {
  if (typeof title !== 'string' || !title.trim() || title.length > 160) throw new Error('production_board_title_invalid');
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 1200) throw new Error('production_board_objective_required');
  if (typeof brief !== 'string' || brief.length > 12000) throw new Error('production_board_brief_invalid');
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || tag.length > 48)) throw new Error('production_board_tags_invalid');
  const root = await ensureProjectDirectory(projectRoot, '.agentsam/primetech');
  const boardId = id('ptb');
  const now = new Date().toISOString();
  const board = {
    schema: BOARD_SCHEMA,
    id: boardId,
    project: { id: projectId, title: title.trim(), objective: objective.trim(), brief, tags },
    status: 'active',
    revision: 1,
    generations: [],
    createdAt: now,
    updatedAt: now,
  };
  const filePath = boardPath(path.join(root, 'boards'), boardId);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeJsonAtomic(filePath, board);
  await writeJsonAtomic(path.join(root, 'active-board.json'), { boardId, updatedAt: now });
  return { ok: true, boardId, revision: board.revision, status: board.status, path: path.relative(projectRoot, filePath), board };
}

export async function getProductionBoard({ projectRoot, boardId } = {}) {
  const root = await ensureProjectDirectory(projectRoot, '.agentsam/primetech/boards');
  const board = await readBoardFile(boardPath(root, boardId));
  return { ok: true, boardId, revision: board.revision, status: board.status, board };
}

export async function listProductionBoards({ projectRoot } = {}) {
  const root = await ensureProjectDirectory(projectRoot, '.agentsam/primetech/boards');
  const names = await fs.readdir(root);
  const boards = [];
  for (const name of names.filter(name => /^ptb_[a-f0-9]{24}\.json$/.test(name))) {
    try {
      const board = await readBoardFile(path.join(root, name));
      boards.push({ boardId: board.id, title: board.project.title, status: board.status, revision: board.revision, generationCount: board.generations.length, updatedAt: board.updatedAt });
    } catch { /* corrupt records are not silently presented as valid boards */ }
  }
  boards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { ok: true, count: boards.length, boards };
}

export async function beginGeneration({ projectRoot, boardId, generationId = null, idempotencyKey = null, kind, brief, prompt = '', sourceRefs = [], expectedRevision = null } = {}) {
  if (typeof kind !== 'string' || !/^[a-z][a-z0-9_.-]{1,79}$/.test(kind)) throw new Error('production_generation_kind_invalid');
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 8000) throw new Error('production_generation_brief_required');
  if (typeof prompt !== 'string' || prompt.length > 12000) throw new Error('production_generation_prompt_invalid');
  if (!Array.isArray(sourceRefs) || sourceRefs.some(ref => typeof ref !== 'string' || ref.length > 1024)) throw new Error('production_generation_source_refs_invalid');
  const root = await ensureProjectDirectory(projectRoot, '.agentsam/primetech/boards');
  const filePath = boardPath(root, boardId);
  return withBoardLock(filePath, async () => {
    const board = await readBoardFile(filePath);
    if (expectedRevision !== null && expectedRevision !== board.revision) throw new Error(`production_board_revision_conflict:${board.revision}`);
    if (idempotencyKey) {
      const prior = board.generations.find(item => item.idempotencyKey === idempotencyKey);
      if (prior) return { ok: true, boardId, revision: board.revision, generationId: prior.id, status: prior.status, idempotentReplay: true, generation: prior };
    }
    const now = new Date().toISOString();
    const record = {
      id: generationId || id('gen'),
      kind,
      status: 'running',
      brief: brief.trim(),
      prompt,
      sourceRefs,
      idempotencyKey,
      attempt: 1,
      artifacts: [],
      qualityChecks: [],
      events: [{ type: 'generation.started', at: now }],
      startedAt: now,
      updatedAt: now,
    };
    if (board.generations.some(item => item.id === record.id)) throw new Error('production_generation_id_conflict');
    board.generations.push(record);
    await saveBoard(filePath, board, board.revision);
    return { ok: true, boardId, revision: board.revision, generationId: record.id, status: record.status, generation: record };
  });
}

export async function completeGeneration({ projectRoot, boardId, generationId, artifacts, qualityChecks = [], receipt = {}, expectedRevision = null } = {}) {
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.some(item => !item || typeof item.ref !== 'string' || !item.ref.trim())) throw new Error('production_generation_artifacts_required');
  if (!Array.isArray(qualityChecks) || !qualityChecks.length || qualityChecks.some(item => !item || typeof item.name !== 'string' || !['pass', 'fail', 'warn'].includes(item.status))) throw new Error('production_generation_quality_checks_required');
  const root = await ensureProjectDirectory(projectRoot, '.agentsam/primetech/boards');
  const filePath = boardPath(root, boardId);
  return withBoardLock(filePath, async () => {
    const board = await readBoardFile(filePath);
    if (expectedRevision !== null && expectedRevision !== board.revision) throw new Error(`production_board_revision_conflict:${board.revision}`);
    const generation = board.generations.find(item => item.id === generationId);
    if (!generation) throw new Error('production_generation_not_found');
    if (generation.status !== 'running' && generation.status !== 'needs_review') throw new Error(`production_generation_not_running:${generation.status}`);
    const now = new Date().toISOString();
    const passed = qualityChecks.every(item => item.status === 'pass');
    generation.status = passed ? 'completed' : 'needs_review';
    generation.artifacts = artifacts;
    generation.qualityChecks = qualityChecks;
    generation.receipt = receipt && typeof receipt === 'object' ? receipt : {};
    generation.completedAt = passed ? now : null;
    generation.updatedAt = now;
    generation.events.push({ type: passed ? 'generation.completed' : 'generation.quality_review_required', at: now, failedChecks: qualityChecks.filter(item => item.status === 'fail').map(item => item.name) });
    await saveBoard(filePath, board, board.revision);
    return { ok: true, boardId, revision: board.revision, generationId, status: generation.status, qualityPassed: passed, generation };
  });
}

export async function failGeneration({ projectRoot, boardId, generationId, error, retryable = true, expectedRevision = null } = {}) {
  if (!error || typeof error !== 'object' || typeof error.code !== 'string') throw new Error('production_generation_error_code_required');
  const root = await ensureProjectDirectory(projectRoot, '.agentsam/primetech/boards');
  const filePath = boardPath(root, boardId);
  return withBoardLock(filePath, async () => {
    const board = await readBoardFile(filePath);
    if (expectedRevision !== null && expectedRevision !== board.revision) throw new Error(`production_board_revision_conflict:${board.revision}`);
    const generation = board.generations.find(item => item.id === generationId);
    if (!generation) throw new Error('production_generation_not_found');
    if (generation.status !== 'running' && generation.status !== 'needs_review') throw new Error(`production_generation_not_running:${generation.status}`);
    const now = new Date().toISOString();
    generation.status = 'failed';
    generation.error = { code: error.code, message: String(error.message || '').slice(0, 1000) };
    generation.retryable = Boolean(retryable);
    generation.updatedAt = now;
    generation.events.push({ type: 'generation.failed', at: now, code: error.code, retryable: Boolean(retryable) });
    await saveBoard(filePath, board, board.revision);
    return { ok: true, boardId, revision: board.revision, generationId, status: generation.status, retryable: generation.retryable, generation };
  });
}

export async function resumeProductionBoard({ projectRoot, boardId } = {}) {
  const result = await getProductionBoard({ projectRoot, boardId });
  const resumable = result.board.generations.filter(item => ['running', 'failed', 'needs_review'].includes(item.status));
  return { ok: true, boardId, revision: result.revision, status: result.status, resumableCount: resumable.length, resumable };
}

export const productionBoardContract = Object.freeze({ schema: BOARD_SCHEMA, generationStatuses: [...GENERATION_STATUSES] });
