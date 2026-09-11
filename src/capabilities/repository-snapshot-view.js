import { createHash } from 'node:crypto';

const VIEW_NAMES = new Set(['index', 'files', 'full']);
const FILTER_FIELDS = Object.freeze([
  'system', 'package', 'category', 'layer', 'kind', 'language', 'role', 'execution_domain', 'tag', 'path', 'symbol', 'import', 'match',
]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_FACET_LIMIT = 48;
const MAX_FACET_LIMIT = 200;

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function values(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  return [...new Set(raw.map(clean).filter(Boolean))];
}

function boundedInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(max, number);
}

function globRegex(glob) {
  const input = clean(glob).replace(/^\.\//, '');
  let source = '^';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '*') {
      if (input[i + 1] === '*') { source += '.*'; i += 1; }
      else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else source += /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`, 'i');
}

function pathMatches(path, selectors) {
  if (!selectors.length) return true;
  const candidate = clean(path).replace(/^\.\//, '');
  return selectors.some((selector) => {
    const normalized = selector.replace(/^\.\//, '');
    if (normalized.includes('*') || normalized.includes('?')) return globRegex(normalized).test(candidate);
    return candidate === normalized || candidate.startsWith(`${normalized.replace(/\/$/, '')}/`);
  });
}

function scalarMatches(value, selectors) {
  if (!selectors.length) return true;
  const candidate = clean(value).toLowerCase();
  return selectors.some((selector) => candidate === selector.toLowerCase());
}

function listMatches(list, selectors) {
  if (!selectors.length) return true;
  const set = new Set((Array.isArray(list) ? list : []).map((value) => clean(value).toLowerCase()));
  return selectors.some((selector) => set.has(selector.toLowerCase()));
}

function lexicalMatches(entry, terms) {
  if (!terms.length) return true;
  const haystack = [
    entry.path, entry.system, entry.package, entry.category, entry.layer, entry.kind, entry.language, entry.role, entry.execution_domain,
    ...(entry.tags || []), ...(entry.symbols || []), ...(entry.imports || []),
  ].map(clean).join('\n').toLowerCase();
  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

export function normalizeRepositorySnapshotFilters(input = {}) {
  return Object.fromEntries(FILTER_FIELDS.map((field) => [field, values(input[field])]).filter(([, list]) => list.length));
}

export function repositoryFileMatches(entry, filters = {}) {
  const f = normalizeRepositorySnapshotFilters(filters);
  return scalarMatches(entry.system, f.system || [])
    && scalarMatches(entry.package, f.package || [])
    && scalarMatches(entry.category, f.category || [])
    && scalarMatches(entry.layer, f.layer || [])
    && scalarMatches(entry.kind, f.kind || [])
    && scalarMatches(entry.language, f.language || [])
    && scalarMatches(entry.role, f.role || [])
    && scalarMatches(entry.execution_domain, f.execution_domain || [])
    && listMatches(entry.tags, f.tag || [])
    && pathMatches(entry.path, f.path || [])
    && listMatches(entry.symbols, f.symbol || [])
    && listMatches(entry.imports, f.import || [])
    && lexicalMatches(entry, f.match || []);
}

function countFacet(entries, getter, limit) {
  const counts = new Map();
  for (const entry of entries) {
    for (const raw of getter(entry)) {
      const value = clean(raw);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export function buildRepositorySnapshotFacets(entries = [], { limit = DEFAULT_FACET_LIMIT } = {}) {
  const bounded = boundedInt(limit, DEFAULT_FACET_LIMIT, MAX_FACET_LIMIT);
  const scalar = (field) => (entry) => entry[field] == null ? [] : [entry[field]];
  return {
    systems: countFacet(entries, scalar('system'), bounded),
    packages: countFacet(entries, scalar('package'), bounded),
    layers: countFacet(entries, scalar('layer'), bounded),
    roles: countFacet(entries, scalar('role'), bounded),
    execution_domains: countFacet(entries, scalar('execution_domain'), bounded),
    kinds: countFacet(entries, scalar('kind'), bounded),
    languages: countFacet(entries, scalar('language'), bounded),
    tags: countFacet(entries, (entry) => entry.tags || [], bounded),
    categories: countFacet(entries, scalar('category'), bounded),
  };
}

function compactEntry(entry) {
  return {
    path: entry.path,
    ...(entry.package ? { package: entry.package } : {}),
    ...(entry.package_root ? { package_root: entry.package_root } : {}),
    ...(entry.system ? { system: entry.system } : {}),
    ...(entry.category ? { category: entry.category } : {}),
    ...(entry.layer ? { layer: entry.layer } : {}),
    ...(entry.kind ? { kind: entry.kind } : {}),
    ...(entry.language ? { language: entry.language } : {}),
    ...(entry.role ? { role: entry.role } : {}),
    ...(entry.execution_domain ? { execution_domain: entry.execution_domain } : {}),
    ...(entry.tags?.length ? { tags: entry.tags } : {}),
    ...(entry.symbols?.length ? { symbols: entry.symbols } : {}),
    ...(entry.imports?.length ? { imports: entry.imports } : {}),
  };
}

function compactTrustBoundary(analysis, limit = 20) {
  const source = analysis?.trust_boundary;
  if (!source) return undefined;
  const findings = Array.isArray(source.findings) ? source.findings : [];
  return {
    trust_boundary: {
      schema_version: source.schema_version,
      analyzer: source.analyzer,
      metadata_root: source.metadata_root,
      complete: source.complete,
      status: source.status,
      ok: source.ok,
      browser_roots: source.browser_roots,
      browser_reachable_files: source.browser_reachable_files,
      ast_files: source.ast_files,
      finding_count: findings.length,
      findings_returned: Math.min(findings.length, limit),
      findings_truncated: findings.length > limit,
      findings: findings.slice(0, limit).map((item) => ({
        kind: item.kind,
        severity: item.severity,
        source: item.source,
        ...(item.target ? { target: item.target } : {}),
        ...(item.specifier ? { specifier: item.specifier } : {}),
        ...(item.env ? { env: item.env } : {}),
        ...(item.repair?.action ? { repair_action: item.repair.action } : {}),
      })),
    },
  };
}

function projectionBase(snapshot) {
  return {
    schema_version: snapshot.schema_version,
    capability: snapshot.capability,
    snapshot_id: snapshot.snapshot_id,
    created_at: snapshot.created_at,
    content_hash: snapshot.content_hash,
    repository: snapshot.repository,
    tree: {
      merkle_root: snapshot.tree?.merkle_root || null,
      metadata_root: snapshot.tree?.metadata_root || null,
      manifest: snapshot.tree?.manifest || null,
      classifier: snapshot.tree?.classifier || null,
      stats: snapshot.tree?.stats || null,
      semantic_stats: snapshot.tree?.semantic_stats || null,
    },
    ...(compactTrustBoundary(snapshot.analysis) ? { analysis: compactTrustBoundary(snapshot.analysis) } : {}),
  };
}

/**
 * Produce a bounded, deterministic view over a canonical repository.snapshot.
 * The canonical content_hash / Merkle identities are carried through unchanged;
 * projection_hash identifies only this derived view and is never an authority root.
 */
export function projectRepositorySnapshot(snapshot, options = {}) {
  if (!snapshot || snapshot.capability !== 'repository.snapshot' || !snapshot.tree) {
    throw new Error('repository_snapshot_required');
  }
  const view = clean(options.view || 'index').toLowerCase();
  if (!VIEW_NAMES.has(view)) throw new Error(`repository_snapshot_view_invalid:${view}`);
  if (view === 'full') return snapshot;

  const files = Array.isArray(snapshot.tree.files) ? snapshot.tree.files : [];
  const filters = normalizeRepositorySnapshotFilters(options.filters || options);
  const filtered = files.filter((entry) => repositoryFileMatches(entry, filters));
  const limit = boundedInt(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const facetLimit = boundedInt(options.facetLimit ?? options.facet_limit, DEFAULT_FACET_LIMIT, MAX_FACET_LIMIT);
  const base = projectionBase(snapshot);
  const result = {
    ...base,
    projection: {
      format: 'agentsam-repository-view',
      version: 1,
      view,
      source_snapshot_id: snapshot.snapshot_id,
      source_content_hash: snapshot.content_hash,
      filters,
      matched: filtered.length,
      returned: view === 'files' ? Math.min(filtered.length, limit) : 0,
      truncated: view === 'files' && filtered.length > limit,
      limit: view === 'files' ? limit : 0,
    },
    facets: buildRepositorySnapshotFacets(filtered, { limit: facetLimit }),
    ...(view === 'files' ? { files: filtered.slice(0, limit).map(compactEntry) } : {}),
  };
  result.projection.projection_hash = sha256({ ...result, projection: { ...result.projection, projection_hash: undefined } });
  return result;
}

export const REPOSITORY_SNAPSHOT_VIEWS = Object.freeze([...VIEW_NAMES]);
