import fs from 'node:fs';
import path from 'node:path';

function clean(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 ? n : 0; }

function parseProfile(value) {
  if (typeof value === 'string') return JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Cloudflare CPU profile must be a Chrome .cpuprofile object');
  return value;
}

function frameOf(node = {}) {
  const frame = node.callFrame || {};
  return {
    node_id: node.id,
    function: clean(frame.functionName) || '(anonymous)',
    url: clean(frame.url) || null,
    line: Number.isInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null,
    column: Number.isInteger(frame.columnNumber) && frame.columnNumber >= 0 ? frame.columnNumber + 1 : null,
  };
}

export function summarizeCloudflareCpuProfile(value, options = {}) {
  const profile = parseProfile(value);
  if (!Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) throw new TypeError('CPU profile requires nodes[] and samples[]');
  const deltas = Array.isArray(profile.timeDeltas) ? profile.timeDeltas : [];
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  let totalUs = 0;
  for (let index = 0; index < profile.samples.length; index += 1) {
    const id = profile.samples[index];
    const deltaUs = number(deltas[index]);
    totalUs += deltaUs;
    totals.set(id, (totals.get(id) || 0) + deltaUs);
  }
  if (!totalUs && Number.isFinite(profile.endTime) && Number.isFinite(profile.startTime)) totalUs = Math.max(0, Number(profile.endTime) - Number(profile.startTime));
  const maxFrames = Number.isInteger(options.maxFrames) && options.maxFrames > 0 ? Math.min(options.maxFrames, 100) : 25;
  const frames = [...totals.entries()].map(([id, selfUs]) => {
    const frame = frameOf(byId.get(id));
    return Object.freeze({
      ...frame,
      self_us: selfUs,
      self_ms: selfUs / 1000,
      percent: totalUs > 0 ? (selfUs / totalUs) * 100 : 0,
      garbage_collection: /(?:garbage collector|\bgc\b)/i.test(frame.function),
    });
  }).sort((a, b) => b.self_us - a.self_us).slice(0, maxFrames);
  return Object.freeze({
    schema_version: 1,
    profile_kind: 'chrome-cpu-profile',
    samples: profile.samples.length,
    total_profile_us: totalUs,
    total_profile_ms: totalUs / 1000,
    top_frames: Object.freeze(frames),
    garbage_collection_ms: frames.filter((row) => row.garbage_collection).reduce((sum, row) => sum + row.self_ms, 0),
    timer_semantics: 'Deployed Workers timers do not advance during CPU-only execution; use local workerd/DevTools CPU profiles plus production CPU metrics.',
  });
}

function within(root, file) { return file === root || file.startsWith(`${root}${path.sep}`); }

export function summarizeCloudflareCpuProfileFile(input = {}) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const file = path.resolve(cwd, clean(input.file));
  if (!clean(input.file)) throw new TypeError('cpu profile file is required');
  if (!within(cwd, file)) throw new Error('cpu_profile_outside_cwd');
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('cpu_profile_not_file');
  if (stat.size > 64 * 1024 * 1024) throw new Error('cpu_profile_too_large');
  return Object.freeze({ file: path.relative(cwd, file) || path.basename(file), ...summarizeCloudflareCpuProfile(fs.readFileSync(file, 'utf8'), input) });
}

function sourceItems(cwd, sources = [], maxChars = 24_000) {
  const rows = [];
  let chars = 0;
  for (const source of sources.slice(0, 12)) {
    const file = path.resolve(cwd, String(source));
    if (!within(cwd, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    const excerpt = text.slice(0, Math.min(8_000, Math.max(0, maxChars - chars)));
    if (!excerpt) break;
    rows.push(Object.freeze({ ref: `file:${path.relative(cwd, file)}`, chars: excerpt.length, content: excerpt }));
    chars += excerpt.length;
    if (chars >= maxChars) break;
  }
  return Object.freeze(rows);
}

export function buildCloudflareCpuAuditPacket(input = {}) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const profile = input.profile ? summarizeCloudflareCpuProfile(input.profile, input) : summarizeCloudflareCpuProfileFile({ ...input, cwd });
  return Object.freeze({
    schema_version: 1,
    primitive: 'cloudflare.cpu.audit',
    rules: Object.freeze({ read_only: true, may_edit: false, may_deploy: false, production_timer_cpu_measurement_valid: false }),
    profile,
    source_evidence: sourceItems(cwd, input.sources || [], Number(input.maxSourceChars || 24_000)),
    questions: Object.freeze([
      'Which frames dominate self CPU time?',
      'Is garbage collection material?',
      'Which source changes are most likely to reduce CPU without changing behavior?',
      'What local production-like request should reproduce the hotspot?',
      'What production metric/log evidence should confirm improvement?',
    ]),
  });
}

export async function runCloudflareCpuAudit(input = {}) {
  if (typeof input.reasoner !== 'function') throw new TypeError('cloudflare.cpu.audit requires an injected reasoner(packet) function');
  const packet = buildCloudflareCpuAuditPacket(input);
  const result = await input.reasoner(structuredClone(packet));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('cloudflare.cpu.audit reasoner must return an object');
  return Object.freeze({ schema_version: 1, primitive: 'cloudflare.cpu.audit', profile: packet.profile, analysis: result });
}
