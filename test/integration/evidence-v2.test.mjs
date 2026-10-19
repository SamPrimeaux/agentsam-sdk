import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createEvidenceOperations } from '../../src/sam/packs/evidence/index.js';
import { createLocalEvidenceStore } from '../../src/sam/packs/evidence/store.js';
import { EVIDENCE_VIEWPORTS, JOURNEY_VIEWPORTS, resolveViewport, viewportId } from '../../src/sam/packs/evidence/viewports.js';
import { assertSubject } from '../../src/sam/packs/evidence/naming.js';
import { auditNames, canonicalViewport, planIngest } from '../../src/sam/packs/evidence/normalize.js';
import { createFfprobeMedia } from '../../src/sam/packs/evidence/media.js';
import { createPlaywrightSource } from '../../src/sam/packs/evidence/driver-playwright.js';
import { createBlenderSource, createLocalBlenderExec } from '../../src/sam/packs/evidence/driver-blender.js';
import { createDeriver } from '../../src/sam/packs/evidence/derive.js';
import { createCoproExporter } from '../../src/sam/packs/evidence/exporter-copro.js';
import { runSamEvidence } from '../../src/commands/sam-evidence.js';

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* optional */ }
let copro = null;
try { copro = await import('../../packages/copro-project/src/index.js'); } catch { /* optional */ }
const have = (bin, args = ['-version']) => { try { execFileSync(bin, args, { stdio: 'ignore', timeout: 15000 }); return true; } catch { return false; } };
const HAS_FFMPEG = have('ffmpeg') && have('ffprobe');
const NOW = new Date('2026-03-04T05:06:07Z');
const PROJECT = 'proj_example';

const png = (width, height, color = { r: 30, g: 60, b: 90 }, rect = null) => {
  let image = sharp({ create: { width, height, channels: 3, background: color } });
  if (rect) image = image.composite([{ input: { create: { width: rect.w, height: rect.h, channels: 3, background: rect.color } }, left: rect.x, top: rect.y }]);
  return image.png().toBuffer();
};
const inline = (bytes, ext = 'png') => ({ kind: 'inline', ext, data: bytes.toString('base64') });
const flows = [{ flow: 0, name: 'Dashboard', steps: [{ step: 1, states: [{ state: 0, name: 'Home' }, { state: 1, name: 'Detail' }] }] }];

async function harness(deps = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-v2-'));
  const store = createLocalEvidenceStore({ root });
  const ops = createEvidenceOperations({ store, resolveTrustedContext: async () => ({ actorId: 'actor_test', project: PROJECT }), authorize: async () => true, now: () => NOW, nonce: () => 'n', ...deps });
  const call = (id, input) => ops.find((o) => o.id === `sam.evidence.${id}`).handler(input, {});
  return { root, store, ops, call, cleanup: async () => { await ops.shutdown(); await rm(root, { recursive: true, force: true }); } };
}
const get = (url, headers = {}) => new Promise((resolve, reject) => {
  http.get(url, { headers }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); }).on('error', reject);
});

test('one viewport vocabulary: ids come from the registry and unknown sizes are refused', () => {
  assert.deepEqual(EVIDENCE_VIEWPORTS.map((v) => v.id), ['mobile-320x568', 'mobile-390x844', 'mobile-430x932', 'tablet-768x1024', 'tablet-1024x768', 'desktop-1440x900', 'desktop-1920x1080']);
  assert.deepEqual(JOURNEY_VIEWPORTS, ['mobile-390x844', 'tablet-768x1024', 'desktop-1440x900']);
  assert.equal(viewportId(390, 844), 'mobile-390x844');
  assert.throws(() => resolveViewport('phone'), { code: 'evidence_viewport_unknown' });
  for (const [legacy, id] of [['iphone', 'mobile-390x844'], ['390', 'mobile-390x844'], ['1440', 'desktop-1440x900'], ['1440x900', 'desktop-1440x900'], ['ipad', 'tablet-768x1024'], ['wide', 'desktop-1920x1080']]) assert.equal(canonicalViewport(legacy), id, legacy);
  assert.equal(canonicalViewport('777'), null);
});

test('subjects cannot carry dates or versions: those live in the run id and the series', () => {
  assert.equal(assertSubject('acme-demo'), 'acme-demo');
  assert.throws(() => assertSubject('projects-review-20261015'), { code: 'evidence_subject_contains_date' });
  assert.throws(() => assertSubject('projects-v1-review'), { code: 'evidence_subject_contains_version' });
  assert.throws(() => assertSubject('Projects Review'), { code: 'evidence_subject_invalid' });
});

test('legacy names from real earlier runs normalize onto the vocabulary without touching originals', () => {
  const at = (day) => Date.parse(`2026-10-${day}T12:00:00Z`);
  const projects = planIngest(['390-catalog.png', '390-detail.png', '1440-catalog.png', '1440-detail.png'].map((p, i) => ({ path: p, mtime: at(15) + i })));
  assert.deepEqual(projects.viewports, ['mobile-390x844', 'desktop-1440x900']);
  assert.deepEqual(projects.flows[0].steps.map((s) => s.states[0].name), ['Catalog', 'Detail']);
  assert.equal(projects.captures.length, 4);
  const work = planIngest([
    'desktop-chats-index.png', 'iphone-chats-index.png', 'desktop-project-chats.png', 'iphone-project-chats.png', 'results.json',
  ].map((p, i) => ({ path: p, mtime: at(16) + i })));
  assert.deepEqual(work.flows[0].steps.map((s) => s.states[0].name), ['ChatsIndex', 'ProjectChats']);
  assert.deepEqual(work.captures.find((c) => c.name === 'Results'), { from: 'results.json', phase: '02-Recon', name: 'Results', kind: 'doc', date: '2026-10-16' });
  const chess = planIngest([
    'CAD-ROBOTICS-CHESS-01--01--sim-initializing--20261016--1440x900.webm', 'CAD-ROBOTICS-CHESS-01--02--asset-loading--20261016--1440x900.webm', 'CAD-ROBOTICS-CHESS-01--desktop-1440x900--original-glbs.png',
  ].map((p, i) => ({ path: p, mtime: at(17) + i })));
  assert.deepEqual(chess.flows[0].steps.map((s) => s.states[0].name), ['SimInitializing', 'AssetLoading', 'OriginalGlbs']);
  assert.ok(chess.captures.every((c) => c.viewport === 'desktop-1440x900'));
  const mixed = planIngest([{ path: 'desktop-home.png', mtime: 1 }, { path: 'home-notes.png', mtime: 2 }]);
  assert.deepEqual(mixed.viewports, []);
  assert.ok(mixed.notes[0].startsWith('viewport_unknown'));
  const audit = auditNames(['04-Build/2026-03-04/00-Dashboard/desktop-1440x900/00-01-00-Home.png', 'iphone-ticket-selected.png']);
  assert.equal(audit.canonical.length, 1);
  assert.deepEqual(audit.legacy[0].suggestion, { name: 'TicketSelected', viewport: 'mobile-390x844', kind: 'still' });
});

test('media adapter probes real files: h264 passes, mpeg4 is refused, durationless browser webm gets a decoded duration', { skip: !HAS_FFMPEG }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'evidence-media-'));
  try {
    const make = (name, codec, extra = []) => { const file = path.join(dir, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=1', '-c:v', codec, ...extra, file]); return file; };
    const media = createFfprobeMedia();
    const h264 = await media.probe({ path: make('a.mp4', 'libx264', ['-pix_fmt', 'yuv420p']) });
    assert.equal(h264.video.codec, 'h264');
    assert.equal(h264.decoded, true);
    assert.ok(Math.abs(h264.durationMs - 1000) < 150);
    const { isBrowserDecodable } = await import('../../src/sam/packs/evidence/seal.js');
    assert.equal(isBrowserDecodable(h264), true);
    const mpeg4 = await media.probe({ path: make('b.mp4', 'mpeg4', ['-pix_fmt', 'yuv420p']) });
    assert.equal(isBrowserDecodable(mpeg4), false);
    const vp8 = await media.probe({ path: make('c.webm', 'libvpx', ['-b:v', '200k']) });
    assert.equal(vp8.video.codec, 'vp8');
    assert.ok(vp8.durationMs > 500, 'duration is recovered from the decoder when the header has none');
    const broken = path.join(dir, 'broken.mp4');
    await writeFile(broken, 'not a video');
    await assert.rejects(media.probe({ path: broken }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('playwright source: the viewport matrix drives context options, errors are kept, only declared actions run', async () => {
  const calls = { contexts: [], shots: [], actions: [] };
  const fake = { chromium: { launch: async () => ({
    close: async () => { calls.closed = true; },
    newContext: async (options) => { calls.contexts.push(options); return { close: async () => {}, newPage: async () => {
      const listeners = {};
      return {
        on: (event, fn) => { listeners[event] = fn; }, goto: async () => { listeners.pageerror?.(new Error('boom')); }, waitForTimeout: async () => {},
        locator: (selector) => ({ first: () => ({ click: async () => calls.actions.push(`click:${selector}`) }) }),
        screenshot: async (options) => { calls.shots.push(options); return Buffer.from('PNG'); },
      };
    } }; },
  }) } };
  const source = createPlaywrightSource({ playwright: fake, waitMs: 0 });
  const got = await source({ source: { url: 'http://example.test/app', actions: [{ type: 'click', selector: '#menu' }], mask: ['.clock'] }, viewport: 'mobile-390x844' });
  assert.equal(got.ext, 'png');
  assert.deepEqual(got.meta.pageErrors, ['pageerror: boom']);
  assert.equal(calls.contexts[0].isMobile, true);
  assert.deepEqual(calls.contexts[0].viewport, { width: 390, height: 844 });
  assert.equal(calls.contexts[0].deviceScaleFactor, 2);
  assert.equal(calls.contexts[0].reducedMotion, 'reduce');
  assert.equal(calls.shots[0].animations, 'disabled');
  assert.deepEqual(calls.actions, ['click:#menu']);
  await assert.rejects(source({ source: { url: 'http://example.test', actions: [{ type: 'evaluate', selector: 'x' }] }, viewport: 'desktop-1440x900' }), { code: 'evidence_source_invalid' });
  await assert.rejects(source({ source: { url: 'file:///etc/passwd' }, viewport: 'desktop-1440x900' }), { code: 'evidence_source_invalid' });
  await assert.rejects(source({ source: { url: 'http://example.test' }, viewport: 'phone' }), { code: 'evidence_viewport_unknown' });
  await source.close();
  assert.equal(calls.closed, true);
  assert.throws(() => createPlaywrightSource({}), { code: 'evidence_driver_unavailable' });
});

test('playwright source against a real browser: one page, three viewports, exact pixel sizes', { skip: !sharp }, async (t) => {
  let mod;
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const from = createRequire(path.join(here, '..', 'apps', 'local-studio', 'package.json'));
    mod = await import(pathToFileURL(from.resolve('playwright')).href);
  } catch { return t.skip('playwright is not installed in this checkout'); }
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>t</title><h1 style="font:40px sans-serif">Journey</h1><button id="go">Go</button>'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const source = createPlaywrightSource({ playwright: mod, scale: 1, waitMs: 100 });
  try {
    for (const id of JOURNEY_VIEWPORTS) {
      const got = await source({ source: { url: `http://127.0.0.1:${server.address().port}/` }, viewport: id });
      const vp = resolveViewport(id);
      const meta = await sharp(got.bytes).metadata();
      assert.deepEqual([meta.width, meta.height], [vp.width, vp.height], id);
    }
  } catch (error) {
    if (/Executable doesn't exist|browserType\.launch/.test(String(error?.message))) return t.skip('no Chromium build installed for this Playwright');
    throw error;
  } finally { await source.close(); server.close(); }
});

test('blender source validates its inputs, stays inside readable roots and renders when Blender is present', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'evidence-blender-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'evidence-outside-'));
  try {
    const tri = (() => {
      const bin = Buffer.alloc(36); [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
      const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] };
      let json = Buffer.from(JSON.stringify(doc)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
      const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
      const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
      const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
      return Buffer.concat([head, jh, json, bh, bin]);
    })();
    const model = path.join(dir, 'tri.glb');
    await writeFile(model, tri);
    await writeFile(path.join(outside, 'x.glb'), tri);
    const seen = [];
    const stub = createBlenderSource({ exec: async ({ args }) => { seen.push(args); return Buffer.from('PNG'); }, readableRoots: [dir] });
    const got = await stub({ source: { model, camera: { location: [2, -3, 2] }, size: [320, 200], samples: 4 } });
    assert.equal(got.ext, 'png');
    assert.deepEqual(seen[0].target, [0, 0, 0]);
    assert.equal(seen[0].engine, 'CYCLES');
    await assert.rejects(stub({ source: { model: path.join(outside, 'x.glb'), camera: { location: [1, 1, 1] } } }), { code: 'evidence_source_outside_readable_roots' });
    await assert.rejects(stub({ source: { model, camera: { location: [1, 1] } } }), { code: 'evidence_source_invalid' });
    await assert.rejects(stub({ source: { model, camera: { location: [1, 1, 1] }, engine: 'EEVEE' } }), { code: 'evidence_source_invalid' });
    assert.throws(() => createBlenderSource({}), { code: 'evidence_driver_unavailable' });
    if (!have('blender', ['--version'])) return t.skip('Blender is not installed here');
    const real = createBlenderSource({ exec: createLocalBlenderExec(), readableRoots: [dir] });
    const rendered = await real({ source: { model, camera: { location: [0.5, -3, 1], target: [0.5, 0.5, 0] }, size: [320, 200], samples: 4 } });
    assert.deepEqual([...rendered.bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    if (sharp) { const meta = await sharp(rendered.bytes).metadata(); assert.deepEqual([meta.width, meta.height], [320, 200]); }
  } finally { await rm(dir, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('derivatives: webp and avif ladder, the cover set at its display sizes, masters untouched', { skip: !sharp }, async () => {
  const derive = createDeriver({ sharp });
  const master = await png(1000, 700);
  const stills = await derive.stills({ bytes: master, stem: '00-01-00-Home' });
  assert.deepEqual(stills.map((s) => s.name), ['00-01-00-Home.480w.webp', '00-01-00-Home.480w.avif', '00-01-00-Home.960w.webp', '00-01-00-Home.960w.avif']);
  assert.equal((await sharp(stills[0].bytes).metadata()).format, 'webp');
  assert.equal((await sharp(stills[1].bytes).metadata()).format, 'heif');
  const covers = await derive.covers({ bytes: master });
  assert.deepEqual(await Promise.all(covers.map(async (c) => { const m = await sharp(c.bytes).metadata(); return `${c.name}:${m.width}x${m.height}`; })),
    ['cover-840x504.webp:840x504', 'thumb-144x144.webp:144x144', 'banner-1000x256.webp:1000x256', 'link-1200x630.webp:1200x630', 'poster-540x960.webp:540x960']);
  assert.throws(() => createDeriver({}), { code: 'evidence_derive_unavailable' });
});

test('full journey: matrix capture, derive, facts, screenplay, review page, final set and editor project from one run', { skip: !sharp || !HAS_FFMPEG }, async () => {
  const h = await harness({
    media: createFfprobeMedia(), derive: createDeriver({ sharp }), images: { sharp }, facts: async () => ({ schema: 'agentsam.evidence.facts.v1', computed: true, git: null }),
    exporters: copro ? { copro: createCoproExporter({ copro }) } : {},
  });
  try {
    const run = await h.call('begin', { subject: 'acme-dashboard', flows, viewports: JOURNEY_VIEWPORTS, checks: [{ id: 'renders' }] });
    assert.equal(run.expectedCaptures, 6);
    const home = await png(600, 400, { r: 20, g: 40, b: 60 });
    const matrix = await h.call('capture', { runId: run.runId, flow: 0, step: 1, state: 0, caption: 'Home </script><b>x', source: inline(home) });
    assert.equal(matrix.ok, true);
    assert.deepEqual(matrix.captures.map((c) => c.viewport), JOURNEY_VIEWPORTS);
    assert.equal(matrix.captures[0].key, '04-Build/2026-03-04/00-Dashboard/mobile-390x844/00-01-00-Home.png');
    assert.deepEqual(await h.call('capture', { runId: run.runId, flow: 0, step: 1, state: 1, viewport: 'phone', source: inline(home) }), { ok: false, error: 'evidence_viewport_unknown' });
    await h.call('capture', { runId: run.runId, flow: 0, step: 1, state: 1, viewports: ['mobile-390x844', 'desktop-1440x900'], source: inline(home) });

    const partial = await h.call('seal', { runId: run.runId, results: { renders: { passed: true } }, approve: ['00-01-00'] });
    assert.equal(partial.status, 'degraded');
    assert.deepEqual(partial.missing, ['00-01-01@tablet-768x1024']);
    const manifest = JSON.parse(await readFile(path.join(h.root, run.prefix, 'evidence.manifest.json'), 'utf8'));
    assert.ok(manifest.derivatives.some((d) => d.key.endsWith('.480w.avif')) && manifest.derivatives.some((d) => d.key.startsWith('06-Handoff/covers/cover-840x504')));
    assert.ok(manifest.final.length > 0 && manifest.final.every((f) => f.key.startsWith('05-Review/Final/')));
    assert.equal(manifest.facts.key, 'facts.json');
    assert.equal(manifest.answers.capturedStates, 5);
    const review = await readFile(path.join(h.root, run.prefix, 'review.html'), 'utf8');
    assert.match(review, /Content-Security-Policy/);
    assert.doesNotMatch(review, /Home <\/script>/, 'captions never break out of the data block');
    assert.match(await readFile(path.join(h.root, run.prefix, '06-Handoff', 'screenplay.md'), 'utf8'), /Missing: `00-01-01@tablet-768x1024`/);
    if (copro) {
      const project = JSON.parse(await readFile(path.join(h.root, run.prefix, '06-Handoff', 'project.copro.json'), 'utf8'));
      assert.equal(project.schema, 'copro.project.v1');
      assert.equal(project.tracks[0].clips.length, 2);
      const assets = JSON.parse(await readFile(path.join(h.root, run.prefix, '06-Handoff', 'assets.json'), 'utf8'));
      assert.ok(Object.keys(assets.assets).every((id) => id.startsWith('ev-')));
      assert.equal(JSON.stringify(project).includes('bucket'), false);
    }
    const served = await h.call('deliver', { runId: run.runId });
    const page = await get(served.reviewUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
  } finally { await h.cleanup(); }
});

test('drift is flagged: hand-dropped files degrade a run, brief and recon assets are captured by name', async () => {
  const h = await harness();
  try {
    const run = await h.call('begin', { subject: 'acme-dashboard', flows });
    const shot = Buffer.from('x');
    for (const state of [0, 1]) await h.call('capture', { runId: run.runId, flow: 0, step: 1, state, source: inline(shot) });
    assert.deepEqual(await h.call('capture', { runId: run.runId, phase: '01-Brief', name: 'prompt', source: inline(shot, 'md') }), { ok: false, error: 'evidence_name_invalid' });
    assert.equal((await h.call('capture', { runId: run.runId, phase: '01-Brief', name: 'Prompt', source: inline(shot, 'md'), kind: 'doc' })).key, '01-Brief/Prompt.md');
    assert.equal((await h.call('capture', { runId: run.runId, phase: '02-Recon', name: 'RepoAudit', source: inline(shot, 'md'), kind: 'doc' })).key, '02-Recon/2026-03-04/RepoAudit.md');
    assert.equal((await h.call('capture', { runId: run.runId, phase: '03-Flow', name: 'X', source: inline(shot) })).error, 'evidence_phase_unsupported');
    await h.store.put(`${run.prefix}/04-Build/2026-03-04/00-Dashboard/iphone-home-FINAL.png`, 'stray');
    const sealed = await h.call('seal', { runId: run.runId });
    assert.equal(sealed.status, 'degraded');
    assert.ok(sealed.reasons.includes('noncanonical_files:1'));
    const manifest = JSON.parse(await readFile(path.join(h.root, run.prefix, 'evidence.manifest.json'), 'utf8'));
    assert.deepEqual(manifest.noncanonical, ['04-Build/2026-03-04/00-Dashboard/iphone-home-FINAL.png']);
    assert.equal(manifest.assets.filter((a) => a.phase !== '04-Build').length, 2);
  } finally { await h.cleanup(); }
});

test('compare crops what changed between two snapshots, per state and viewport', { skip: !sharp }, async () => {
  const h = await harness({ images: { sharp } });
  try {
    const seal = async (nonce, shots) => {
      const run = await h.call('begin', { subject: 'acme-dashboard', flows, viewports: ['desktop-1440x900'], nonce });
      for (const [state, bytes] of shots) await h.call('capture', { runId: run.runId, flow: 0, step: 1, state, source: inline(bytes) });
      await h.call('seal', { runId: run.runId });
      return run;
    };
    const base = await png(400, 300);
    const polished = await png(400, 300, { r: 30, g: 60, b: 90 }, { x: 120, y: 80, w: 90, h: 40, color: { r: 240, g: 200, b: 40 } });
    const a = await seal('a', [[0, base], [1, base]]);
    const b = await seal('b', [[0, base], [1, polished]]);
    const result = await h.call('compare', { a: a.runId, b: b.runId });
    assert.deepEqual([result.changed, result.unchanged, result.unmatchedA, result.unmatchedB], [1, 1, 0, 0]);
    const doc = JSON.parse(await readFile(path.join(h.root, b.prefix, result.key), 'utf8'));
    const pair = doc.pairs.find((p) => p.stateId === '00-01-01');
    assert.equal(pair.status, 'changed');
    assert.ok(pair.changedRatio > 0.02 && pair.changedRatio < 0.05);
    assert.equal(pair.regions.length, 1);
    const crop = await sharp(await readFile(path.join(h.root, b.prefix, pair.regions[0].key))).metadata();
    assert.ok(crop.width > crop.height, 'then | now sit side by side');
    assert.match(await readFile(path.join(h.root, b.prefix, 'review.html'), 'utf8'), /Changed since/);
    await assert.rejects(h.call('compare', { a: a.runId, b: a.runId }), { code: 'evidence_compare_same_run' });
  } finally { await h.cleanup(); }
});

test('compare needs an image engine and sealed runs', async () => {
  const h = await harness();
  try { await assert.rejects(h.call('compare', { a: 'acme-dashboard--20260304--aaaaaaa', b: 'acme-dashboard--20260304--bbbbbbb' }), { code: 'evidence_image_engine_unavailable' }); } finally { await h.cleanup(); }
});

test('ingest: dry run by default, apply imports a legacy folder into a canonical run, originals untouched', { skip: !sharp }, async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'legacy-'));
  const h = await harness({ readableRoots: [source] });
  try {
    for (const [i, name] of ['desktop-chats-index.png', 'iphone-chats-index.png', 'desktop-project-chats.png', 'iphone-project-chats.png'].entries()) {
      await writeFile(path.join(source, name), await png(200, 150, { r: i * 40, g: 50, b: 80 }));
      const stamp = new Date(Date.parse('2026-10-16T12:00:00Z') + i * 1000);
      await utimes(path.join(source, name), stamp, stamp);
    }
    await writeFile(path.join(source, 'results.json'), '{"ok":true}');
    await utimes(path.join(source, 'results.json'), new Date('2026-10-16T12:00:09Z'), new Date('2026-10-16T12:00:09Z'));
    const before = (await readdir(source)).sort();
    const dry = await h.call('ingest', { subject: 'work-visual-review', source: { path: source } });
    assert.equal(dry.applied, false);
    assert.equal(dry.plan.captures.length, 5);
    assert.equal((await h.store.list('proj_example').catch(() => [])).length, 0, 'a dry run writes nothing');
    const applied = await h.call('ingest', { subject: 'work-visual-review', source: { path: source }, apply: true });
    assert.equal(applied.ok, true);
    assert.equal(applied.imported, 5);
    assert.deepEqual((await readdir(source)).sort(), before);
    const sealed = await h.call('seal', { runId: applied.runId });
    assert.equal(sealed.status, 'verified', 'a complete legacy import has nothing missing, so it is verified');
    const manifest = JSON.parse(await readFile(path.join(h.root, applied.prefix, 'evidence.manifest.json'), 'utf8'));
    assert.deepEqual(manifest.viewports, ['mobile-390x844', 'desktop-1440x900']);
    assert.deepEqual(manifest.missing, []);
    assert.ok(manifest.assets.some((a) => a.key === '02-Recon/2026-10-16/Results.json'));
    await assert.rejects(h.call('ingest', { subject: 'x', source: { path: os.tmpdir() } }), { code: 'evidence_source_outside_readable_roots' });
    await assert.rejects(h.call('ingest', { subject: 'work-visual-review-20261016', source: { path: source }, apply: true }), { code: 'evidence_subject_contains_date' });
  } finally { await h.cleanup(); await rm(source, { recursive: true, force: true }); }
});

test('CLI: doctor reports what is wired; capture needs a project; input errors are JSON, not stack traces', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-cli-'));
  try {
    const lines = [];
    const write = (s) => lines.push(s);
    const doctor = await runSamEvidence(['doctor'], { root, write });
    assert.equal(doctor.ok, true);
    assert.equal(doctor.project, null);
    assert.equal(doctor.store, path.join(root, '.agentsam', 'evidence'));
    assert.equal(doctor.adapters.facts, 'git');
    await writeFile(path.join(root, 'begin.json'), JSON.stringify({ subject: 'acme-demo', flows }));
    const noProject = await runSamEvidence(['begin', '--input', 'begin.json'], { root, write });
    assert.deepEqual([noProject.ok, noProject.error], [false, 'evidence_project_unresolved']);
    await writeFile(path.join(root, 'begin.json'), JSON.stringify({ subject: 'acme-demo', project: 'proj_example', flows }));
    const begun = await runSamEvidence(['begin', '--input', 'begin.json'], { root, write });
    assert.equal(begun.ok, true);
    assert.ok((await readdir(path.join(root, '.agentsam', 'evidence', 'proj_example'))).some((d) => d.startsWith('acme-demo--')));
    assert.equal((await runSamEvidence(['capture'], { root, write })).error, 'input_required');
    assert.equal((await runSamEvidence(['nonsense'], { root, write })).error, 'unknown_sam_evidence_command');
    await writeFile(path.join(root, 'bad.json'), '{');
    assert.equal((await runSamEvidence(['seal', '--input', 'bad.json'], { root, write })).error, 'invalid_json_input');
    await writeFile(path.join(root, 'iphone-home.png'), 'x');
    const audit = await runSamEvidence(['audit', root], { root, write });
    assert.equal(audit.ok, false);
    assert.ok(audit.legacy.some((l) => l.path === 'iphone-home.png' && l.suggestion.viewport === 'mobile-390x844'));
    assert.equal((await runSamEvidence(['audit', os.tmpdir()], { root, write })).error, 'directory_outside_readable_roots');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the v2 pack still carries no project-specific values', async () => {
  const dir = new URL('../../src/sam/packs/evidence/', import.meta.url);
  for (const file of await readdir(dir)) {
    const source = await readFile(new URL(file, dir), 'utf8');
    assert.doesNotMatch(source, /proj_[a-z0-9]{6,}_[a-z0-9]{4,}/, `${file}: concrete project id`);
    assert.doesNotMatch(source, /\b5303\b/, `${file}: literal dev port`);
    assert.doesNotMatch(source, /127\.0\.0\.1:\d/, `${file}: literal loopback port`);
    assert.doesNotMatch(source, /\/Users\/|\/home\//, `${file}: absolute home path`);
  }
});
