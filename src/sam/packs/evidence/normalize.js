import path from 'node:path';
import { CAPTURE_FILE_RE, PLAIN_FILE_RE, VIEWPORT_DIR_RE, utcDate } from './naming.js';
import { EVIDENCE_VIEWPORTS, VIEWPORT_HEIGHTS, viewportId } from './viewports.js';

const NOISE = new Set(['qa', 'evidence', 'review', 'final', 'preview', 'capture']);
const WORD_VIEWPORTS = Object.freeze({
  iphone: 'mobile-390x844', phone: 'mobile-390x844', mobile: 'mobile-390x844',
  ipad: 'tablet-768x1024', tablet: 'tablet-768x1024',
  desktop: 'desktop-1440x900', laptop: 'desktop-1440x900', wide: 'desktop-1920x1080',
});
const KINDS = Object.freeze({
  png: 'still', jpg: 'still', jpeg: 'still', webp: 'still', avif: 'still', gif: 'still',
  webm: 'clip', mp4: 'clip', mov: 'clip', json: 'doc', md: 'doc', txt: 'log', log: 'log',
});

/** Map any legacy size token ("iphone", "390", "1440x900", "desktop") to a registry id, or null. */
export function canonicalViewport(token) {
  const t = String(token).toLowerCase();
  if (WORD_VIEWPORTS[t]) return WORD_VIEWPORTS[t];
  if (/^\d{3,4}$/.test(t)) return VIEWPORT_HEIGHTS[Number(t)] ? viewportId(Number(t), VIEWPORT_HEIGHTS[Number(t)]) : null;
  const dims = /^(\d{3,4})x(\d{3,4})$/.exec(t);
  if (dims) { const id = viewportId(Number(dims[1]), Number(dims[2])); return EVIDENCE_VIEWPORTS.some((v) => v.id === id) ? id : null; }
  return null;
}

export function parseLegacyName(file) {
  const base = path.basename(file);
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const stem = dot > 0 ? base.slice(0, dot) : base;
  let viewport = null;
  const words = [];
  for (const raw of stem.split(/[-_\s.]+/).filter(Boolean)) {
    const token = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!token) continue;
    const vp = canonicalViewport(token);
    if (vp) { viewport ??= vp; continue; }
    if (/^(19|20)\d{6}$/.test(token) || /^\d+$/.test(token) || /^v\d+$/.test(token) || NOISE.has(token)) continue;
    words.push(token);
  }
  return { ext, kind: KINDS[ext] ?? null, viewport, words };
}

const camel = (words) => {
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 48);
  return /^[A-Z]/.test(name) ? name : name ? `S${name}`.slice(0, 48) : 'Untitled';
};

/**
 * Plan how an existing folder of captures maps onto the canonical layout. Pure and deterministic:
 * nothing is copied, renamed or moved. Stills/clips become states in one flow (one step per distinct
 * name); docs and logs go to 02-Recon. Viewports are declared only when every flow asset has one.
 */
export function planIngest(files, { flowName = 'Imported', stripCommonPrefix = true } = {}) {
  const parsed = files.map((file) => ({ file, ...parseLegacyName(file.path) }));
  const skipped = parsed.filter((p) => !p.kind).map((p) => ({ from: p.file.path, reason: 'unsupported_extension' }));
  const usable = parsed.filter((p) => p.kind);
  if (stripCommonPrefix && usable.length > 1) {
    const first = usable[0].words;
    let n = 0;
    while (n < first.length && usable.every((u) => u.words[n] === first[n])) n += 1;
    if (n > 0 && usable.every((u) => u.words.length > n)) usable.forEach((u) => { u.words = u.words.slice(n); });
  }
  usable.sort((a, b) => a.file.mtime - b.file.mtime || a.file.path.localeCompare(b.file.path));

  const flowAssets = usable.filter((u) => u.kind === 'still' || u.kind === 'clip');
  const steps = new Map();
  const perSlot = new Map();
  for (const u of flowAssets) {
    u.name = camel(u.words);
    if (!steps.has(u.name)) steps.set(u.name, steps.size);
    const slot = `${u.name}|${u.viewport ?? ''}`;
    perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
  }
  const counter = new Map();
  const captures = [];
  for (const u of flowAssets) {
    const slot = `${u.name}|${u.viewport ?? ''}`;
    const index = counter.get(slot) ?? 0;
    counter.set(slot, index + 1);
    captures.push({
      from: u.file.path, phase: '04-Build', flow: 0, step: steps.get(u.name), state: 0, name: u.name,
      ...(perSlot.get(slot) > 1 ? { variant: String.fromCharCode(97 + index) } : {}),
      viewport: u.viewport, kind: u.kind, date: utcDate(u.file.mtime),
    });
  }
  for (const u of usable.filter((x) => x.kind === 'doc' || x.kind === 'log')) {
    captures.push({ from: u.file.path, phase: '02-Recon', name: camel(u.words), kind: u.kind, date: utcDate(u.file.mtime) });
  }
  const notes = [];
  const everyViewport = flowAssets.length > 0 && flowAssets.every((u) => u.viewport);
  if (flowAssets.some((u) => !u.viewport)) notes.push('viewport_unknown_for_some_assets:viewports_not_declared');
  const viewports = everyViewport ? EVIDENCE_VIEWPORTS.map((v) => v.id).filter((id) => flowAssets.some((u) => u.viewport === id)) : [];
  const flows = flowAssets.length === 0 ? [] : [{
    flow: 0, name: flowName,
    steps: [...steps.entries()].map(([name, step]) => ({ step, states: [{ state: 0, name }] })),
  }];
  return { flows, viewports, captures, skipped, notes };
}

/** Classify relative paths against the canonical layout. */
export function auditNames(paths) {
  const canonical = [];
  const legacy = [];
  for (const rel of paths) {
    const parts = rel.split('/');
    const base = parts.at(-1);
    const inViewportDir = parts.length > 1 && VIEWPORT_DIR_RE.test(parts.at(-2));
    if ((CAPTURE_FILE_RE.test(base) && (inViewportDir || !parts.some((p) => VIEWPORT_DIR_RE.test(p)))) || PLAIN_FILE_RE.test(base)) {
      canonical.push(rel);
      continue;
    }
    const parsed = parseLegacyName(base);
    legacy.push({ path: rel, suggestion: parsed.kind ? { name: camel(parsed.words), viewport: parsed.viewport, kind: parsed.kind } : null });
  }
  return { canonical, legacy };
}
