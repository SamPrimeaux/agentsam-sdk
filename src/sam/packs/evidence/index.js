import { randomBytes } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { defineSamOperation } from '../../define.js';
import {
  EVIDENCE_BUILD_PHASE, EVIDENCE_CAPTURE_SCHEMA, EVIDENCE_FLOW_MAP_SCHEMA, EVIDENCE_KINDS, EVIDENCE_SCHEMA,
  EXT_TYPES, evidenceError, renderEvidenceReadme,
} from './contract.js';
import {
  CAMEL_RE, DATE_RE, PROJECT_RE, RUN_ID_RE, SLUG_RE, VIEWPORT_DIR_RE, assertSafeKey, captureFilename, flowDirName, makeRunId, plainFilename, stateId, utcDate,
} from './naming.js';
import { computeStatus, findNoncanonical, isBrowserDecodable, renderSrt } from './seal.js';
import { startEvidenceServer } from './serve.js';
import { resolveViewport } from './viewports.js';
import { planIngest } from './normalize.js';
import { renderScreenplay } from './screenplay.js';
import { renderReviewHtml } from './review-page.js';
import { compareRuns } from './compare.js';

const MAX_INLINE_BYTES = 50 * 1024 * 1024;
const MAX_INGEST_FILES = 5000;
const CAPTURE_PHASES = ['01-Brief', '02-Recon', EVIDENCE_BUILD_PHASE];
const STILL_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const isIndex = (n) => Number.isInteger(n) && n >= 0 && n <= 999;
const invalidFlows = (detail) => evidenceError('evidence_flow_map_invalid', detail);

function resolveProject(value) {
  if (value === undefined || value === null) return null;
  const spec = typeof value === 'string' ? { id: value, slug: value } : value;
  if (typeof spec !== 'object' || typeof spec.slug !== 'string' || !PROJECT_RE.test(spec.slug)) throw evidenceError('evidence_project_invalid');
  if (spec.id !== undefined && typeof spec.id !== 'string') throw evidenceError('evidence_project_invalid');
  return { id: spec.id ?? spec.slug, slug: spec.slug };
}

function validateFlows(flows) {
  if (!Array.isArray(flows) || flows.length === 0 || flows.length > 64) throw invalidFlows('flows');
  const seenFlows = new Set();
  let states = 0;
  const out = flows.map((flow) => {
    if (!isIndex(flow?.flow) || !CAMEL_RE.test(flow?.name ?? '') || seenFlows.has(flow.flow) || !Array.isArray(flow.steps) || flow.steps.length === 0) throw invalidFlows('flow');
    seenFlows.add(flow.flow);
    const seenSteps = new Set();
    return {
      flow: flow.flow, name: flow.name,
      steps: flow.steps.map((step) => {
        if (!isIndex(step?.step) || seenSteps.has(step.step) || (step.name !== undefined && !CAMEL_RE.test(step.name)) || !Array.isArray(step.states) || step.states.length === 0) throw invalidFlows('step');
        seenSteps.add(step.step);
        const seenStates = new Set();
        return {
          step: step.step, ...(step.name ? { name: step.name } : {}),
          states: step.states.map((state) => {
            if (!isIndex(state?.state) || seenStates.has(state.state) || !CAMEL_RE.test(state?.name ?? '')) throw invalidFlows('state');
            seenStates.add(state.state);
            states += 1;
            return { state: state.state, name: state.name };
          }),
        };
      }),
    };
  });
  return { flows: out, states };
}

function validateViewports(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 7) throw evidenceError('evidence_viewports_invalid');
  const ids = list.map((id) => resolveViewport(id).id);
  if (new Set(ids).size !== ids.length) throw evidenceError('evidence_viewports_invalid');
  return ids;
}

function validateChecks(checks = []) {
  if (!Array.isArray(checks) || checks.length > 64) throw evidenceError('evidence_check_invalid');
  const seen = new Set();
  return checks.map((check) => {
    if (typeof check?.id !== 'string' || !SLUG_RE.test(check.id) || seen.has(check.id)) throw evidenceError('evidence_check_invalid');
    seen.add(check.id);
    return { id: check.id, description: typeof check.description === 'string' ? check.description : '' };
  });
}

function declaredStates(flowMap) {
  const out = [];
  for (const flow of flowMap.flows) for (const step of flow.steps) for (const state of step.states) out.push({ id: stateId(flow.flow, step.step, state.state), flow, step, state });
  return out;
}

/** Every declared state, times every declared viewport when a matrix was declared. */
function expectedCaptures(flowMap) {
  const viewports = flowMap.viewports ?? [];
  const out = [];
  for (const s of declaredStates(flowMap)) for (const v of viewports.length > 0 ? viewports : [null]) out.push({ ...s, viewport: v, key: v ? `${s.id}@${v}` : s.id });
  return out;
}

const assetDate = (asset) => (asset.phase === '01-Brief' ? asset.capturedAt.slice(0, 10) : asset.key.split('/')[1]);

async function listFiles(directory) {
  const found = [];
  const walk = async (dir, rel) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs, childRel);
      else if (entry.isFile()) {
        if (found.length >= MAX_INGEST_FILES) throw evidenceError('evidence_ingest_too_many_files');
        const info = await stat(abs);
        found.push({ path: childRel, abs, mtime: info.mtimeMs, bytes: info.size });
      }
    }
  };
  await walk(directory, '');
  return found;
}

/**
 * Evidence operations: begin -> capture (xN, across viewports) -> seal -> deliver; plus compare and ingest.
 *
 * Host-injected, like the other packs: a store, a trusted principal and an authorizer. The project comes from
 * the caller or the host principal, never from a default. Capture drivers (screen, renderer) are injected via
 * `sources`; `media` verifies video; `derive` writes web copies and covers; `images` ({ sharp }) powers compare;
 * `facts` computes progression facts; `exporters` write editor projects. Everything optional stays optional.
 */
export function createEvidenceOperations({
  store, resolveTrustedContext, authorize, sources = {}, media = null, derive = null, images = null, facts = null,
  exporters = {}, readableRoots = [], now = () => new Date(), nonce = () => randomBytes(8).toString('hex'),
} = {}) {
  for (const name of ['put', 'get', 'has', 'list']) {
    if (typeof store?.[name] !== 'function') throw new Error(`sam_evidence_store_missing:${name}`);
  }
  if (typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function') {
    throw new Error('sam_evidence_requires_trusted_principal_and_authorization');
  }
  for (const root of readableRoots) if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('sam_evidence_readable_root_invalid');
  const servers = new Set();

  async function principalFor(action, input, ctx) {
    const principal = await resolveTrustedContext(ctx);
    if (!principal || typeof principal !== 'object' || !principal.actorId) throw evidenceError('evidence_trusted_principal_required');
    const project = resolveProject(input.project ?? principal.project);
    if (!project) throw evidenceError('evidence_project_unresolved');
    return { principal, project, action };
  }
  async function permit({ principal, project, action }, runId) {
    if ((await authorize({ principal, action, project: project.id, projectSlug: project.slug, runId })) !== true) throw evidenceError('evidence_access_denied');
  }
  async function runFor(action, input, ctx) {
    const who = await principalFor(action, input, ctx);
    if (typeof input.runId !== 'string' || !RUN_ID_RE.test(input.runId)) throw evidenceError('evidence_run_id_invalid');
    await permit(who, input.runId);
    const root = `${who.project.slug}/${input.runId}`;
    const raw = await store.get(`${root}/03-Flow/flow.map.json`);
    if (!raw) throw evidenceError('evidence_run_unknown');
    return { ...who, root, flowMap: JSON.parse(raw.toString('utf8')) };
  }
  async function readJson(key, fallback) {
    const raw = await store.get(key);
    return raw ? JSON.parse(raw.toString('utf8')) : fallback;
  }
  async function insideReadable(candidate) {
    if (readableRoots.length === 0) throw evidenceError('evidence_source_unsupported');
    const real = await realpath(candidate);
    const allowed = await Promise.all(readableRoots.map((root) => realpath(root)));
    if (!allowed.some((root) => real === root || real.startsWith(root + path.sep))) throw evidenceError('evidence_source_outside_readable_roots');
    return real;
  }

  async function inlineSource({ source }) {
    const ext = String(source.ext ?? '').toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(ext) || typeof source.data !== 'string') throw evidenceError('evidence_source_invalid');
    const bytes = Buffer.from(source.data, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_INLINE_BYTES) throw evidenceError('evidence_source_invalid');
    return { bytes, ext, durationMs: source.durationMs };
  }
  async function fileSource({ source }) {
    if (typeof source.path !== 'string' || !path.isAbsolute(source.path)) throw evidenceError('evidence_source_invalid');
    const real = await insideReadable(source.path);
    return { bytes: await readFile(real), ext: path.extname(real).slice(1).toLowerCase(), durationMs: source.durationMs };
  }
  const drivers = { inline: inlineSource, ...(readableRoots.length > 0 ? { file: fileSource } : {}), ...sources };

  async function writeReview(root, manifest, compareDocs) {
    const screenplay = renderScreenplay(manifest);
    await store.put(`${root}/review.html`, renderReviewHtml({ manifest, screenplay: screenplay.json, derivatives: manifest.derivatives ?? [], compare: compareDocs }));
    return screenplay;
  }

  const op = (id, action, risk, summary, handler, extra = {}) => defineSamOperation({
    id, module: 'evidence', action, summary,
    purpose: 'Systematic, labeled capture of agent work so one capture feeds QA, changelogs, case studies and editors.',
    execution: { lanes: ['local'], model: 'never', network: 'none', sideEffects: 'local_write' },
    risk, capabilities: [risk === 'read_only' ? 'evidence.read' : 'evidence.write'], status: 'experimental', handler, ...extra,
  });

  const begin = op('sam.evidence.begin', 'begin', 'write',
    'Declare the flows, steps, states, viewports and checks a run must produce before anything is captured.',
    async (input = {}, ctx = {}) => {
      const who = await principalFor('evidence.write', input, ctx);
      const startedDate = input.startedAt === undefined ? now() : new Date(input.startedAt);
      if (Number.isNaN(startedDate.getTime())) throw evidenceError('evidence_started_at_invalid');
      const startedAt = startedDate.toISOString();
      const { flows, states } = validateFlows(input.flows);
      const viewports = validateViewports(input.viewports);
      const checks = validateChecks(input.checks);
      const runId = makeRunId({ subject: input.subject, project: who.project.slug, startedAt, nonce: input.nonce ?? nonce() });
      await permit(who, runId);
      const root = `${who.project.slug}/${runId}`;
      if (await store.has(`${root}/03-Flow/flow.map.json`)) throw evidenceError('evidence_run_exists');
      const flowMap = {
        schema: EVIDENCE_FLOW_MAP_SCHEMA, runId, subject: input.subject, project: who.project, startedAt,
        profile: typeof input.profile === 'string' ? input.profile : 'web-review', flows, checks, ...(viewports.length > 0 ? { viewports } : {}),
      };
      await store.put(`${root}/03-Flow/flow.map.json`, json(flowMap));
      await store.put(`${root}/README.md`, renderEvidenceReadme({ runId, subject: input.subject, project: who.project, startedAt }));
      return { ok: true, runId, prefix: root, declaredStates: states, expectedCaptures: states * Math.max(viewports.length, 1) };
    });

  async function captureOne({ run, phase, found, kind, date, viewport, input }) {
    const tag = viewport ? { viewport } : {};
    try {
      const got = await drivers[input.source.kind]({ source: input.source, input, flowMap: run.flowMap, viewport });
      if (!Buffer.isBuffer(got?.bytes) || !/^[a-z0-9]{2,5}$/.test(got.ext ?? '')) throw evidenceError('evidence_source_invalid');
      let relative;
      let filename;
      let flowDir = null;
      if (phase === EVIDENCE_BUILD_PHASE) {
        filename = captureFilename({ flow: found.flow.flow, step: found.step.step, state: found.state.state, variant: input.variant, name: found.state.name, ext: got.ext });
        flowDir = flowDirName(found.flow.flow, found.flow.name);
        relative = `${phase}/${date}/${flowDir}${viewport ? `/${viewport}` : ''}/${filename}`;
      } else {
        filename = plainFilename({ name: input.name, ext: got.ext });
        relative = phase === '02-Recon' ? `${phase}/${date}/${filename}` : `${phase}/${filename}`;
      }
      const key = `${run.root}/${relative}`;
      if (await store.has(key)) return { ok: false, error: 'evidence_capture_exists', ...tag };
      const stored = await store.put(key, got.bytes);
      const meta = got.meta !== undefined && JSON.stringify(got.meta).length <= 16384 ? got.meta : undefined;
      await store.put(`${key}.evidence.json`, json({
        schema: EVIDENCE_CAPTURE_SCHEMA, key: relative, file: filename, phase, flow: found?.flow.flow ?? null, step: found?.step.step ?? null, state: found?.state.state ?? null,
        stateId: found?.id ?? null, variant: input.variant ?? null, viewport: viewport ?? null, name: found?.state.name ?? input.name, kind,
        contentType: EXT_TYPES[got.ext] ?? 'application/octet-stream', bytes: stored.bytes, sha256: stored.sha256, capturedAt: now().toISOString(),
        source: { kind: input.source.kind }, ...(input.caption ? { caption: input.caption } : {}),
        ...(Number.isFinite(got.durationMs) ? { durationMs: got.durationMs } : {}), ...(meta !== undefined ? { meta } : {}),
      }));
      if (input.beat && flowDir) {
        const beatsKey = `${run.root}/${phase}/${date}/${flowDir}${viewport ? `/${viewport}` : ''}/${flowDir}.beats.json`;
        const beats = await readJson(beatsKey, []);
        beats.push({ state: found.id, label: String(input.beat.label ?? found.state.name), ...(Number.isFinite(input.beat.atMs) ? { atMs: input.beat.atMs } : {}), at: now().toISOString() });
        await store.put(beatsKey, json(beats));
      }
      return { ok: true, key: relative, sha256: stored.sha256, bytes: stored.bytes, ...tag };
    } catch (error) {
      const code = String(error?.code ?? '').startsWith('evidence_') ? error.code : 'evidence_capture_failed';
      if (found) {
        const errorsKey = `${run.root}/${EVIDENCE_BUILD_PHASE}/capture-errors.json`;
        await readJson(errorsKey, []).then((list) => store.put(errorsKey, json([...list, { stateId: found.id, ...(viewport ? { viewport } : {}), error: code, at: now().toISOString() }]))).catch(() => {});
      }
      return { ok: false, error: code, ...tag };
    }
  }

  const capture = op('sam.evidence.capture', 'capture', 'write',
    'Capture one asset against a declared state (optionally across the declared viewport matrix), or a brief/recon asset. Operational failures return ok:false.',
    async (input = {}, ctx = {}) => {
      const run = await runFor('evidence.write', input, ctx);
      const phase = input.phase ?? EVIDENCE_BUILD_PHASE;
      if (!CAPTURE_PHASES.includes(phase)) return { ok: false, error: 'evidence_phase_unsupported' };
      const kind = input.kind ?? 'still';
      const date = input.date ?? utcDate(now());
      if (!EVIDENCE_KINDS.includes(kind) || !DATE_RE.test(date) || (input.caption !== undefined && (typeof input.caption !== 'string' || input.caption.length > 200))) {
        return { ok: false, error: 'evidence_capture_invalid' };
      }
      if (!drivers[input.source?.kind]) return { ok: false, error: 'evidence_source_unsupported' };
      let found = null;
      let viewports = [null];
      if (phase === EVIDENCE_BUILD_PHASE) {
        found = declaredStates(run.flowMap).find((s) => s.flow.flow === input.flow && s.step.step === input.step && s.state.state === input.state);
        if (!found) return { ok: false, error: 'evidence_state_undeclared' };
        if (input.name !== undefined && input.name !== found.state.name) return { ok: false, error: 'evidence_name_mismatch' };
        const declared = run.flowMap.viewports ?? [];
        const asked = Array.isArray(input.viewports) ? input.viewports : input.viewport !== undefined ? [input.viewport] : declared.length > 0 ? declared : [null];
        if (asked.length === 0) return { ok: false, error: 'evidence_viewport_unknown' };
        try { for (const v of asked) if (v !== null) resolveViewport(v); } catch { return { ok: false, error: 'evidence_viewport_unknown' }; }
        if (declared.length > 0 && asked.some((v) => !declared.includes(v))) return { ok: false, error: 'evidence_viewport_undeclared' };
        viewports = asked;
      } else if (!CAMEL_RE.test(input.name ?? '')) {
        return { ok: false, error: 'evidence_name_invalid' };
      }
      const results = [];
      for (const viewport of viewports) results.push(await captureOne({ run, phase, found, kind, date, viewport, input }));
      return results.length === 1 ? results[0] : { ok: results.every((r) => r.ok), captures: results };
    });

  const seal = op('sam.evidence.seal', 'seal', 'write',
    'Verify declared coverage and codecs, derive web copies and covers, compute facts, write screenplay and review page, then the manifest last. Status is computed.',
    async (input = {}, ctx = {}) => {
      const run = await runFor('evidence.write', input, ctx);
      const manifestKey = `${run.root}/evidence.manifest.json`;
      if (await store.has(manifestKey)) throw evidenceError('evidence_already_sealed');
      const rel = (key) => key.slice(run.root.length + 1);
      const relKeys = [];
      for (const phase of CAPTURE_PHASES) relKeys.push(...(await store.list(`${run.root}/${phase}`)).map(rel));
      const assets = [];
      for (const key of relKeys.filter((k) => k.endsWith('.evidence.json'))) assets.push(JSON.parse((await store.get(`${run.root}/${key}`)).toString('utf8')));
      assets.sort((a, b) => a.key.localeCompare(b.key));

      const reasons = [];
      const noncanonical = findNoncanonical(relKeys);
      if (noncanonical.length > 0) reasons.push(`noncanonical_files:${noncanonical.length}`);
      const flowAssets = assets.filter((a) => a.phase === EVIDENCE_BUILD_PHASE);
      const captured = new Set(flowAssets.map((a) => (a.viewport ? `${a.stateId}@${a.viewport}` : a.stateId)));
      const missing = expectedCaptures(run.flowMap).map((e) => e.key).filter((k) => !captured.has(k)).sort();
      const results = input.results && typeof input.results === 'object' ? input.results : {};
      const checks = run.flowMap.checks.map((check) => {
        const result = results[check.id];
        return { ...check, status: result === undefined ? 'not_reported' : result.passed === true ? 'passed' : 'failed', ...(result?.detail ? { detail: String(result.detail) } : {}) };
      });

      for (const asset of assets.filter((a) => a.contentType.startsWith('video/'))) {
        if (typeof media?.probe !== 'function') { if (!reasons.includes('media_unverified')) reasons.push('media_unverified'); continue; }
        const fullKey = `${run.root}/${asset.key}`;
        const info = await media.probe({ key: fullKey, path: typeof store.localPath === 'function' ? await store.localPath(fullKey) : null, contentType: asset.contentType });
        asset.media = info;
        if (!isBrowserDecodable(info)) reasons.push(`codec_not_browser_decodable:${asset.stateId ?? asset.file}`);
      }

      const derivatives = [];
      if (derive) {
        const putDerived = async (relKey, file, of) => {
          const out = await store.put(`${run.root}/${relKey}`, file.bytes);
          derivatives.push({ key: relKey, of, format: file.format, ...(file.width ? { width: file.width } : {}), bytes: out.bytes, sha256: out.sha256 });
        };
        for (const asset of assets) {
          const base = asset.phase === EVIDENCE_BUILD_PHASE ? `05-Review/${asset.key.slice(EVIDENCE_BUILD_PHASE.length + 1)}` : `05-Review/${asset.key}`;
          const dir = base.split('/').slice(0, -1).join('/');
          const stem = asset.file.replace(/\.[^.]+$/, '');
          try {
            if (STILL_TYPES.has(asset.contentType) && typeof derive.stills === 'function') {
              for (const file of await derive.stills({ bytes: await store.get(`${run.root}/${asset.key}`), stem })) await putDerived(`${dir}/${file.name}`, file, asset.key);
            } else if (asset.contentType.startsWith('video/') && typeof derive.video === 'function' && typeof store.localPath === 'function') {
              for (const file of await derive.video({ path: await store.localPath(`${run.root}/${asset.key}`), stem })) await putDerived(`${dir}/${file.name}`, file, asset.key);
            }
          } catch { reasons.push(`derive_failed:${asset.stateId ?? asset.file}`); }
        }
        const stills = flowAssets.filter((a) => STILL_TYPES.has(a.contentType));
        const wanted = input.cover && typeof input.cover === 'object' ? stills.find((a) => a.stateId === input.cover.stateId && (a.viewport ?? null) === (input.cover.viewport ?? null)) : null;
        const cover = wanted ?? stills.find((a) => a.viewport === 'desktop-1440x900') ?? stills[0];
        if (cover && typeof derive.covers === 'function') {
          try { for (const file of await derive.covers({ bytes: await store.get(`${run.root}/${cover.key}`) })) await putDerived(`06-Handoff/covers/${file.name}`, file, cover.key); } catch { reasons.push('derive_failed:covers'); }
        }
      }

      let factsRef = null;
      if (typeof facts === 'function') {
        try {
          const computed = await facts();
          const out = await store.put(`${run.root}/facts.json`, json(computed));
          factsRef = { key: 'facts.json', sha256: out.sha256 };
        } catch { reasons.push('facts_failed'); }
      }

      const handoff = [];
      const beats = {};
      for (const key of relKeys.filter((k) => k.endsWith('.beats.json'))) {
        beats[key] = JSON.parse((await store.get(`${run.root}/${key}`)).toString('utf8'));
        const srt = renderSrt(beats[key]);
        if (!srt) continue;
        const parts = key.split('/');
        const suffix = VIEWPORT_DIR_RE.test(parts.at(-2)) ? `.${parts.at(-2)}` : '';
        const name = `markers.${parts.at(-1).replace('.beats.json', '')}${suffix}.srt`;
        const put = await store.put(`${run.root}/06-Handoff/${name}`, srt);
        handoff.push({ key: `06-Handoff/${name}`, bytes: put.bytes, sha256: put.sha256 });
      }
      for (const [name, exporter] of Object.entries(exporters)) {
        try {
          const out = await exporter({ store, root: run.root, flowMap: run.flowMap, assets, runId: input.runId, beats });
          for (const file of out?.files ?? []) {
            assertSafeKey(`06-Handoff/${file.name}`);
            const put = await store.put(`${run.root}/06-Handoff/${file.name}`, file.body);
            handoff.push({ key: `06-Handoff/${file.name}`, bytes: put.bytes, sha256: put.sha256, exporter: name });
          }
        } catch { reasons.push(`exporter_failed:${name}`); }
      }

      const final = [];
      const approve = input.approve === 'all' ? 'all' : Array.isArray(input.approve) ? new Set(input.approve) : null;
      if (approve) {
        const approved = flowAssets.filter((a) => approve === 'all' || approve.has(a.stateId));
        const keys = new Set(approved.map((a) => a.key));
        for (const asset of approved) {
          const out = await store.put(`${run.root}/05-Review/Final/${asset.key.slice(EVIDENCE_BUILD_PHASE.length + 1)}`, await store.get(`${run.root}/${asset.key}`));
          final.push({ key: `05-Review/Final/${asset.key.slice(EVIDENCE_BUILD_PHASE.length + 1)}`, of: asset.key, sha256: out.sha256 });
        }
        for (const d of derivatives.filter((x) => keys.has(x.of) && x.key.startsWith('05-Review/'))) {
          const target = `05-Review/Final/${d.key.slice('05-Review/'.length)}`;
          const out = await store.put(`${run.root}/${target}`, await store.get(`${run.root}/${d.key}`));
          final.push({ key: target, of: d.of, sha256: out.sha256 });
        }
      }

      const perDate = {};
      for (const asset of assets) { const date = assetDate(asset); perDate[date] = (perDate[date] ?? 0) + 1; }
      const expected = expectedCaptures(run.flowMap);
      const status = computeStatus({ assets: flowAssets, missing, checks, reasons });
      const manifest = {
        schema: EVIDENCE_SCHEMA, runId: input.runId, subject: run.flowMap.subject, project: run.flowMap.project, startedAt: run.flowMap.startedAt,
        sealedAt: now().toISOString(), status, reasons, ...(run.flowMap.viewports ? { viewports: run.flowMap.viewports } : {}),
        flows: run.flowMap.flows, checks, missing, errors: await readJson(`${run.root}/${EVIDENCE_BUILD_PHASE}/capture-errors.json`, []),
        noncanonical, assets, derivatives, final, handoff, ...(factsRef ? { facts: factsRef } : {}),
        answers: { daysOfWork: Object.keys(perDate).sort(), capturedPerDate: perDate, declaredStates: declaredStates(run.flowMap).length, capturedStates: expected.length - missing.length, missingStates: missing },
      };
      const screenplay = await writeReview(run.root, manifest, []);
      for (const [name, body] of [['screenplay.md', screenplay.md], ['screenplay.json', json(screenplay.json)]]) {
        const put = await store.put(`${run.root}/06-Handoff/${name}`, body);
        manifest.handoff.push({ key: `06-Handoff/${name}`, bytes: put.bytes, sha256: put.sha256 });
      }
      manifest.review = { key: 'review.html' };
      await store.put(manifestKey, json(manifest)); // written LAST: the completion marker
      return { ok: true, status, reasons, missing, manifestKey: 'evidence.manifest.json', assets: assets.length, derivatives: derivatives.length, final: final.length };
    }, { artifacts: ['evidence.manifest'] });

  const deliver = op('sam.evidence.deliver', 'deliver', 'write',
    'Serve a sealed run read-only on loopback (port 0 unless requested) and return the manifest and review-page URLs.',
    async (input = {}, ctx = {}) => {
      const run = await runFor('evidence.read', input, ctx);
      if (!(await store.has(`${run.root}/evidence.manifest.json`))) throw evidenceError('evidence_not_sealed');
      if (input.port !== undefined && !(Number.isInteger(input.port) && input.port >= 0 && input.port <= 65535)) throw evidenceError('evidence_port_invalid');
      const ttlSeconds = Math.min(Math.max(Number(input.ttlSeconds ?? 900), 30), 3600);
      const server = await startEvidenceServer({ store, prefix: run.root, port: input.port ?? 0, ttlMs: ttlSeconds * 1000 });
      servers.add(server);
      server.onClose(() => servers.delete(server));
      const manifestUrl = `${server.origin}/evidence.manifest.json`;
      let viewerLink;
      if (input.viewerUrl !== undefined) {
        const viewer = new URL(String(input.viewerUrl));
        if (viewer.protocol !== 'http:' && viewer.protocol !== 'https:') { await server.close(); throw evidenceError('evidence_viewer_url_invalid'); }
        viewer.searchParams.set('evidence', manifestUrl);
        viewerLink = viewer.toString();
      }
      return { ok: true, url: server.url, manifestUrl, reviewUrl: `${server.origin}/review.html`, ...(viewerLink ? { viewerLink } : {}), expiresAt: server.expiresAt, ttlSeconds };
    });

  const compare = op('sam.evidence.compare', 'compare', 'write',
    'Pair the same state across two sealed runs of one project and crop what changed (then | now). Results are written under the newer run.',
    async (input = {}, ctx = {}) => {
      if (typeof images?.sharp !== 'function') throw evidenceError('evidence_image_engine_unavailable');
      const who = await principalFor('evidence.write', input, ctx);
      for (const id of [input.a, input.b]) if (typeof id !== 'string' || !RUN_ID_RE.test(id)) throw evidenceError('evidence_run_id_invalid');
      if (input.a === input.b) throw evidenceError('evidence_compare_same_run');
      await permit(who, input.b);
      const rootA = `${who.project.slug}/${input.a}`;
      const rootB = `${who.project.slug}/${input.b}`;
      const [manifestA, manifestB] = await Promise.all([readJson(`${rootA}/evidence.manifest.json`, null), readJson(`${rootB}/evidence.manifest.json`, null)]);
      if (!manifestA || !manifestB) throw evidenceError('evidence_not_sealed');
      const result = await compareRuns({ sharp: images.sharp, store, rootA, rootB, runA: input.a, manifestA, manifestB, now });
      await writeReview(rootB, manifestB, [result]);
      const count = (status) => result.pairs.filter((p) => p.status === status).length;
      return { ok: true, key: result.key, changed: count('changed'), unchanged: count('unchanged'), dimensionChanged: count('dimension_changed'), unmatchedA: result.unmatchedA.length, unmatchedB: result.unmatchedB.length };
    });

  const ingest = op('sam.evidence.ingest', 'ingest', 'write',
    'Plan (default) or apply the import of an existing folder of captures into the canonical layout. Originals are never moved or renamed.',
    async (input = {}, ctx = {}) => {
      await principalFor('evidence.write', input, ctx);
      const dir = input.source?.path;
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw evidenceError('evidence_source_invalid');
      const real = await insideReadable(dir);
      const files = await listFiles(real);
      const plan = planIngest(files.map((f) => ({ path: f.path, mtime: f.mtime })), { flowName: input.flowName });
      if (input.apply !== true) return { ok: true, applied: false, plan };
      if (plan.flows.length === 0) return { ok: false, applied: false, error: 'evidence_ingest_nothing_to_import', plan };
      const begun = await begin.handler({ subject: input.subject, project: input.project, flows: plan.flows, viewports: plan.viewports }, ctx);
      const byPath = new Map(files.map((f) => [f.path, f]));
      const results = [];
      for (const c of plan.captures) {
        const outcome = await capture.handler({
          runId: begun.runId, project: input.project, phase: c.phase, flow: c.flow, step: c.step, state: c.state, name: c.name, variant: c.variant,
          viewport: c.viewport ?? undefined, kind: c.kind, date: c.date, source: { kind: 'file', path: byPath.get(c.from).abs },
        }, ctx);
        results.push({ from: c.from, ...outcome });
      }
      const failed = results.filter((r) => !r.ok);
      return { ok: failed.length === 0, applied: true, runId: begun.runId, prefix: begun.prefix, imported: results.length - failed.length, failed, skipped: plan.skipped, notes: plan.notes };
    });

  const operations = [begin, capture, seal, deliver, compare, ingest];
  operations.shutdown = async () => {
    await Promise.all([...servers].map((server) => server.close()));
    await Promise.all(Object.values(drivers).map((driver) => driver.close?.()));
  };
  return operations;
}
