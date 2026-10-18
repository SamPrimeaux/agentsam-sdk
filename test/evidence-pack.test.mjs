import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, mkdir } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createEvidenceOperations } from '../src/sam/packs/evidence/index.js';
import { createLocalEvidenceStore } from '../src/sam/packs/evidence/store.js';
import { makeRunId, captureFilename, CAPTURE_FILE_RE } from '../src/sam/packs/evidence/naming.js';
import { createSamOS } from '../src/sam/os.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const inline = (ext = 'png', data = PNG) => ({ kind: 'inline', ext, data: data.toString('base64') });
const flows = [{ flow: 0, name: 'Geometry', steps: [{ step: 3, states: [{ state: 1, name: 'RoofsBuilt' }] }] }];
const NOW = new Date('2026-01-02T03:04:05Z');

async function harness({ principal = { actorId: 'actor_test' }, deps = {} } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-test-'));
  const store = createLocalEvidenceStore({ root });
  const ops = createEvidenceOperations({ store, resolveTrustedContext: async () => principal, authorize: async () => true, now: () => NOW, nonce: () => 'fixed-nonce', ...deps });
  const call = (id, input) => ops.find((o) => o.id === id).handler(input, {});
  return { root, store, ops, call, cleanup: async () => { await ops.shutdown(); await rm(root, { recursive: true, force: true }); } };
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('run ids are deterministic, git-independent and use the caller subject', () => {
  const input = { subject: 'acme-demo', project: 'proj_example', startedAt: NOW.toISOString(), nonce: 'n' };
  assert.equal(makeRunId(input), makeRunId(input));
  assert.match(makeRunId(input), /^acme-demo--20260102--[a-f0-9]{7}$/);
  assert.notEqual(makeRunId(input), makeRunId({ ...input, nonce: 'other' }));
  assert.throws(() => makeRunId({ ...input, subject: 'Bad Subject' }), { code: 'evidence_subject_invalid' });
});

test('file names are zero-padded CamelCase and bad names are rejected at write time', () => {
  const file = captureFilename({ flow: 0, step: 3, state: 1, name: 'RoofsBuilt', ext: 'png' });
  assert.equal(file, '00-03-01-RoofsBuilt.png');
  assert.equal(captureFilename({ flow: 1, step: 2, state: 0, variant: 'a', name: 'Search', ext: 'webm' }), '01-02-00a-Search.webm');
  assert.ok(CAPTURE_FILE_RE.test(file));
  assert.throws(() => captureFilename({ flow: 0, step: 3, state: 1, name: 'roofs built', ext: 'png' }), { code: 'evidence_name_invalid' });
});

test('begin fails with evidence_project_unresolved when nothing provides a project', async () => {
  const h = await harness();
  try {
    await assert.rejects(h.call('sam.evidence.begin', { subject: 'acme-demo', flows }), { code: 'evidence_project_unresolved' });
  } finally { await h.cleanup(); }
});

test('the project from the host principal or the call is used end to end, with no defaults', async () => {
  for (const [principalProject, inputProject, expected] of [['proj_host_a', undefined, 'proj_host_a'], ['proj_host_a', 'proj_call_b', 'proj_call_b']]) {
    const h = await harness({ principal: { actorId: 'actor_test', project: principalProject } });
    try {
      const begun = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows, ...(inputProject ? { project: inputProject } : {}) });
      assert.ok(begun.prefix.startsWith(`${expected}/acme-demo--20260102--`));
      const flowMap = JSON.parse(await readFile(path.join(h.root, begun.prefix, '03-Flow', 'flow.map.json'), 'utf8'));
      assert.equal(flowMap.project.slug, expected);
      assert.equal(begun.declaredStates, 1);
    } finally { await h.cleanup(); }
  }
});

test('capture binds to a declared state, hashes the asset and refuses duplicates', async () => {
  const h = await harness({ principal: { actorId: 'actor_test', project: 'proj_example' } });
  try {
    const { runId } = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows });
    assert.deepEqual(await h.call('sam.evidence.capture', { runId, flow: 9, step: 9, state: 9, source: inline() }), { ok: false, error: 'evidence_state_undeclared' });
    assert.deepEqual(await h.call('sam.evidence.capture', { runId, flow: 0, step: 3, state: 1, name: 'Wrong', source: inline() }), { ok: false, error: 'evidence_name_mismatch' });
    const done = await h.call('sam.evidence.capture', { runId, flow: 0, step: 3, state: 1, source: inline() });
    assert.equal(done.ok, true);
    assert.equal(done.key, '04-Build/2026-01-02/00-Geometry/00-03-01-RoofsBuilt.png');
    assert.match(done.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(await h.call('sam.evidence.capture', { runId, flow: 0, step: 3, state: 1, source: inline() }), { ok: false, error: 'evidence_capture_exists' });
    assert.deepEqual(await h.call('sam.evidence.capture', { runId, flow: 0, step: 3, state: 1, variant: 'a', source: { kind: 'nope' } }), { ok: false, error: 'evidence_source_unsupported' });
  } finally { await h.cleanup(); }
});

test('seal computes status from the tree: verified, degraded, failed', async () => {
  const wide = [{ flow: 0, name: 'Geometry', steps: [{ step: 3, states: [{ state: 1, name: 'RoofsBuilt' }, { state: 2, name: 'WallsBuilt' }] }] }];
  const h = await harness({ principal: { actorId: 'actor_test', project: 'proj_example' } });
  try {
    const run = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows: wide, checks: [{ id: 'geometry-valid', description: 'Geometry passes' }], nonce: 'a' });
    await h.call('sam.evidence.capture', { runId: run.runId, flow: 0, step: 3, state: 1, source: inline() });
    const partial = await h.call('sam.evidence.seal', { runId: run.runId, results: { 'geometry-valid': { passed: true } } });
    assert.equal(partial.status, 'degraded');
    assert.deepEqual(partial.missing, ['00-03-02']);
    const manifest = JSON.parse(await readFile(path.join(h.root, run.prefix, 'evidence.manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'agentsam.evidence.v1');
    assert.equal(manifest.answers.capturedStates, 1);
    await assert.rejects(h.call('sam.evidence.seal', { runId: run.runId }), { code: 'evidence_already_sealed' });

    const full = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows: wide, checks: [{ id: 'geometry-valid' }], nonce: 'b' });
    for (const state of [1, 2]) await h.call('sam.evidence.capture', { runId: full.runId, flow: 0, step: 3, state, source: inline() });
    assert.equal((await h.call('sam.evidence.seal', { runId: full.runId, results: { 'geometry-valid': { passed: true } } })).status, 'verified');

    const unreported = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows, checks: [{ id: 'geometry-valid' }], nonce: 'c' });
    await h.call('sam.evidence.capture', { runId: unreported.runId, flow: 0, step: 3, state: 1, source: inline() });
    assert.equal((await h.call('sam.evidence.seal', { runId: unreported.runId })).status, 'degraded');

    const bad = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows, checks: [{ id: 'geometry-valid' }], nonce: 'd' });
    await h.call('sam.evidence.capture', { runId: bad.runId, flow: 0, step: 3, state: 1, source: inline() });
    assert.equal((await h.call('sam.evidence.seal', { runId: bad.runId, results: { 'geometry-valid': { passed: false } } })).status, 'failed');

    const empty = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows, nonce: 'e' });
    assert.equal((await h.call('sam.evidence.seal', { runId: empty.runId })).status, 'failed');
  } finally { await h.cleanup(); }
});

test('video needs a probe, and non-browser codecs are never reported as verified', async () => {
  const clip = Buffer.from('not-really-video');
  const results = {};
  for (const [label, media] of [['none', null], ['h264', { probe: async () => ({ video: { codec: 'h264' }, audio: { codec: 'aac' } }) }], ['mpeg4', { probe: async () => ({ video: { codec: 'mpeg4' } }) }]]) {
    const h = await harness({ principal: { actorId: 'actor_test', project: 'proj_example' }, deps: { media } });
    try {
      const run = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows });
      assert.equal((await h.call('sam.evidence.capture', { runId: run.runId, flow: 0, step: 3, state: 1, kind: 'clip', source: inline('webm', clip), beat: { label: 'Roofs built', atMs: 1500 } })).ok, true);
      results[label] = await h.call('sam.evidence.seal', { runId: run.runId });
      if (label === 'h264') assert.ok((await readdir(path.join(h.root, run.prefix, '06-Handoff'))).some((f) => f.endsWith('.srt')), 'timed beats become markers');
    } finally { await h.cleanup(); }
  }
  assert.deepEqual([results.none.status, results.none.reasons], ['degraded', ['media_unverified']]);
  assert.equal(results.h264.status, 'verified');
  assert.equal(results.mpeg4.status, 'degraded');
  assert.match(results.mpeg4.reasons[0], /^codec_not_browser_decodable:00-03-01$/);
});

test('policy failures throw; the store cannot be escaped', async () => {
  const denied = await harness({ principal: { actorId: 'actor_test', project: 'proj_example' }, deps: { authorize: async () => false } });
  try { await assert.rejects(denied.call('sam.evidence.begin', { subject: 'acme-demo', flows }), { code: 'evidence_access_denied' }); } finally { await denied.cleanup(); }
  const anon = await harness({ principal: {} });
  try { await assert.rejects(anon.call('sam.evidence.begin', { subject: 'acme-demo', flows, project: 'proj_example' }), { code: 'evidence_trusted_principal_required' }); } finally { await anon.cleanup(); }

  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-store-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'evidence-outside-'));
  try {
    const store = createLocalEvidenceStore({ root });
    for (const key of ['../x', '/abs', 'a/../b', 'a//b', '.hidden']) await assert.rejects(store.put(key, 'x'), { code: 'evidence_key_invalid' });
    await mkdir(path.join(root, 'proj'), { recursive: true });
    await symlink(outside, path.join(root, 'proj', 'link'));
    await assert.rejects(store.put('proj/link/escape.txt', 'x'), { code: 'evidence_key_invalid' });
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('deliver serves a sealed run on loopback: two servers, own ports, CORS and Host guards, Range', async () => {
  const h = await harness({ principal: { actorId: 'actor_test', project: 'proj_example' } });
  try {
    const run = await h.call('sam.evidence.begin', { subject: 'acme-demo', flows });
    await assert.rejects(h.call('sam.evidence.deliver', { runId: run.runId }), { code: 'evidence_not_sealed' });
    await h.call('sam.evidence.capture', { runId: run.runId, flow: 0, step: 3, state: 1, source: inline() });
    await h.call('sam.evidence.seal', { runId: run.runId });

    const [a, b] = await Promise.all([h.call('sam.evidence.deliver', { runId: run.runId }), h.call('sam.evidence.deliver', { runId: run.runId, viewerUrl: 'http://viewer.example/open?x=1' })]);
    assert.notEqual(new URL(a.url).port, new URL(b.url).port, 'each server binds its own port');
    assert.equal(new URL(b.viewerLink).searchParams.get('evidence'), b.manifestUrl);
    assert.equal(new URL(b.viewerLink).searchParams.get('x'), '1');

    const manifest = await get(a.manifestUrl);
    assert.equal(manifest.status, 200);
    assert.equal(JSON.parse(manifest.body).runId, run.runId);

    const asset = `${new URL(a.url).origin}/04-Build/2026-01-02/00-Geometry/00-03-01-RoofsBuilt.png`;
    const ranged = await get(asset, { Range: 'bytes=0-3' });
    assert.equal(ranged.status, 206);
    assert.deepEqual([...ranged.body], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(ranged.headers['content-range'], `bytes 0-3/${PNG.length}`);

    assert.equal((await get(a.manifestUrl, { Origin: 'http://localhost:4000' })).headers['access-control-allow-origin'], 'http://localhost:4000');
    assert.equal((await get(a.manifestUrl, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await get(a.manifestUrl, { Host: 'evil.example' })).status, 403);
    assert.equal((await get(`${new URL(a.url).origin}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
  } finally { await h.cleanup(); }
});

test('the pack registers in an isolated SAM OS with the repo convention', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-os-'));
  try {
    const sam = createSamOS({ core: false, evidence: { store: createLocalEvidenceStore({ root }), resolveTrustedContext: async () => ({ actorId: 'a' }), authorize: async () => true } });
    assert.deepEqual(sam.list().map((o) => o.id), ['sam.evidence.begin', 'sam.evidence.capture', 'sam.evidence.compare', 'sam.evidence.deliver', 'sam.evidence.ingest', 'sam.evidence.seal']);
    assert.throws(() => createEvidenceOperations({ store: createLocalEvidenceStore({ root }) }), /requires_trusted_principal_and_authorization/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the pack carries no project-specific values', async () => {
  const dir = new URL('../src/sam/packs/evidence/', import.meta.url);
  for (const file of await readdir(dir)) {
    const source = await readFile(new URL(file, dir), 'utf8');
    assert.doesNotMatch(source, /proj_[a-z0-9]{6,}_[a-z0-9]{4,}/, `${file}: concrete project id`);
    assert.doesNotMatch(source, /\b5303\b/, `${file}: literal dev port`);
    assert.doesNotMatch(source, /127\.0\.0\.1:\d/, `${file}: literal loopback port`);
    assert.doesNotMatch(source, /\/Users\/|\/home\//, `${file}: absolute home path`);
  }
});
