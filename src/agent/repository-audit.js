import { repositorySnapshot } from '../capabilities/repository-snapshot.js';

const DEPTHS = new Set(['quick', 'standard', 'deep']);
const FORBIDDEN_OUTPUT_KEYS = new Set(['jobs', 'executions', 'commits', 'deployments', 'mutations', 'patches']);
const ARRAY_FIELDS = [
  'packages',
  'binaries',
  'commands',
  'capabilities',
  'services',
  'protocols',
  'notable_combinations',
  'findings',
  'cleanup_candidates',
  'recommended_routes',
  'evidence_refs',
  'artifacts',
];

function boundedStrings(values = [], max = 32, field = 'value') {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  return values.slice(0, max).map((value) => String(value).trim()).filter(Boolean);
}

function shrinkEvidence(evidence, characterBudget) {
  const out = structuredClone(evidence);
  const shrinkable = [
    ['pressure_points', 12, 6, 3],
    ['top_level', 20, 10, 5],
    ['file_paths', 400, 200, 100],
    ['packages', 40, 20, 10],
    ['languages', 30, 15, 8],
    ['manifests', 40, 20, 10],
  ];
  for (const [key, ...limits] of shrinkable) {
    const original = Array.isArray(out[key]) ? out[key] : [];
    for (const limit of limits) {
      if (JSON.stringify(out).length <= characterBudget) break;
      out[key] = original.slice(0, limit);
    }
  }
  if (JSON.stringify(out).length > characterBudget) {
    out.top_level = [];
    out.pressure_points = [];
  }
  if (JSON.stringify(out).length > characterBudget) {
    out.file_paths = [];
    out.packages = [];
    out.languages = [];
    out.manifests = [];
  }
  return out;
}

export function buildRepositoryAuditPacket({
  snapshot,
  focus = [],
  depth = 'standard',
  requestedSections = [],
  evidenceBudget = 8000,
} = {}) {
  if (snapshot?.capability !== 'repository.snapshot' || !snapshot.snapshot_id) {
    throw new TypeError('repository.audit requires a repository.snapshot result');
  }
  if (!DEPTHS.has(depth)) throw new RangeError(`depth must be one of: ${[...DEPTHS].join(', ')}`);
  if (!Number.isInteger(evidenceBudget) || evidenceBudget < 1000 || evidenceBudget > 64000) {
    throw new RangeError('evidenceBudget must be an integer from 1000..64000');
  }

  const evidence = shrinkEvidence({
    repository: snapshot.repository,
    tree: { merkle_root: snapshot.tree?.merkle_root, stats: snapshot.tree?.stats },
    file_paths: snapshot.tree?.paths || [],
    summary: snapshot.intelligence?.summary || {},
    languages: snapshot.intelligence?.languages || [],
    manifests: snapshot.intelligence?.manifests || [],
    top_level: snapshot.intelligence?.top_level || [],
    pressure_points: snapshot.intelligence?.pressure_points || [],
    packages: snapshot.packages || [],
    knowledge: snapshot.knowledge || { configured: false },
    deploy: snapshot.deploy || null,
  }, evidenceBudget * 4);

  const prefix = `snapshot:${snapshot.snapshot_id}`;
  return Object.freeze({
    schema_version: 1,
    primitive: 'repository.audit',
    snapshot_id: snapshot.snapshot_id,
    snapshot_content_hash: snapshot.content_hash,
    focus: boundedStrings(focus, 24, 'focus'),
    depth,
    requested_sections: boundedStrings(requestedSections, 24, 'requestedSections'),
    evidence_budget: evidenceBudget,
    evidence,
    evidence_index: Object.freeze({
      repository: `${prefix}#repository`,
      tree: `${prefix}#tree`,
      summary: `${prefix}#intelligence.summary`,
      languages: `${prefix}#intelligence.languages`,
      manifests: `${prefix}#intelligence.manifests`,
      packages: `${prefix}#packages`,
      knowledge: `${prefix}#knowledge`,
      deploy: `${prefix}#deploy`,
    }),
    rules: Object.freeze({
      read_only: true,
      may_edit: false,
      may_deploy: false,
      may_create_jobs: false,
      evidence_must_come_from_packet: true,
    }),
  });
}

function normalizeAnalysis(value, snapshotId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('repository.audit reasoner must return an object');
  for (const key of FORBIDDEN_OUTPUT_KEYS) {
    if (Object.hasOwn(value, key)) throw new Error(`repository.audit output may not contain mutation field: ${key}`);
  }
  if (typeof value.summary !== 'string' || !value.summary.trim()) throw new TypeError('repository.audit output requires summary');
  const prefix = `snapshot:${snapshotId}#`;
  const result = {
    summary: value.summary.trim(),
    repository_map: value.repository_map ?? null,
    file_tree: value.file_tree ?? null,
  };
  for (const field of ARRAY_FIELDS) result[field] = Array.isArray(value[field]) ? structuredClone(value[field]) : [];
  for (const ref of result.evidence_refs) {
    if (typeof ref !== 'string' || !ref.startsWith(prefix)) throw new Error(`repository.audit invalid evidence ref: ${ref}`);
  }
  return result;
}

/**
 * Optional AgentSam/LLM layer over deterministic repository evidence.
 * The SDK owns evidence collection and output validation; the caller injects reasoning.
 */
export async function runRepositoryAudit({
  cwd = process.cwd(),
  snapshot,
  focus = [],
  depth = 'standard',
  requestedSections = [],
  evidenceBudget = 8000,
  reasoner,
} = {}) {
  if (typeof reasoner !== 'function') throw new TypeError('repository.audit requires an injected reasoner(packet) function');
  const resolvedSnapshot = snapshot || await repositorySnapshot({ cwd });
  const packet = buildRepositoryAuditPacket({ snapshot: resolvedSnapshot, focus, depth, requestedSections, evidenceBudget });
  const analysis = normalizeAnalysis(await reasoner(structuredClone(packet)), resolvedSnapshot.snapshot_id);
  return {
    schema_version: 1,
    primitive: 'repository.audit',
    snapshot_id: resolvedSnapshot.snapshot_id,
    snapshot_content_hash: resolvedSnapshot.content_hash,
    generated_at: new Date().toISOString(),
    ...analysis,
  };
}

export function renderRepositoryAuditMarkdown(audit) {
  if (audit?.primitive !== 'repository.audit') throw new TypeError('repository.audit result required');
  const lines = [`# Repository audit`, '', audit.summary, '', `Snapshot: \`${audit.snapshot_id}\``];
  const sections = [
    ['Packages', audit.packages],
    ['Commands', audit.commands],
    ['Capabilities', audit.capabilities],
    ['Services', audit.services],
    ['Protocols', audit.protocols],
    ['Notable combinations', audit.notable_combinations],
    ['Findings', audit.findings],
    ['Cleanup candidates', audit.cleanup_candidates],
    ['Recommended routes', audit.recommended_routes],
  ];
  for (const [title, rows] of sections) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    lines.push('', `## ${title}`, '');
    for (const row of rows) lines.push(`- ${typeof row === 'string' ? row : JSON.stringify(row)}`);
  }
  return `${lines.join('\n')}\n`;
}
