import { builtinModules } from 'node:module';

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')]));
const SERVER_PACKAGES = new Set([
  'pg', 'postgres', 'mysql', 'mysql2', 'better-sqlite3', 'sqlite3', 'tedious', 'oracledb',
]);
const PUBLIC_ENV_PREFIX = /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_|REACT_APP_)/;
const SECRETISH_ENV = /(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DATABASE_URL|API_KEY|ACCESS_KEY|CLIENT_SECRET|SIGNING_KEY|ENCRYPTION_KEY)/i;

function packageRoot(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  const clean = specifier.replace(/^node:/, '');
  if (clean.startsWith('@')) return clean.split('/').slice(0, 2).join('/');
  return clean.split('/')[0];
}

function finding(kind, entry, extra = {}) {
  return {
    kind,
    severity: 'high',
    source: entry.path,
    source_hash: entry.hash,
    execution_domain: entry.execution_domain,
    ...extra,
  };
}

export function repairSuggestionForBoundaryFinding(item) {
  const base = { finding: item.kind, automatic: false, evidence: { source: item.source, target: item.target || null } };
  if (item.kind === 'browser-server-import') return {
    ...base,
    action: 'move-server-call-behind-api-boundary',
    summary: 'Keep the browser-facing contract client-safe; move the privileged implementation behind a server/API boundary and call it over HTTP/RPC.',
  };
  if (item.kind === 'browser-server-runtime-import') return {
    ...base,
    action: 'move-server-dependency-out-of-browser-graph',
    summary: `Move ${item.specifier} to server-owned code; expose only a bounded request/response contract to the browser.`,
  };
  if (item.kind === 'browser-private-env-access' || item.kind === 'browser-public-secret-name') return {
    ...base,
    action: 'move-secret-to-server-runtime',
    summary: `Treat ${item.env} as server-owned. Browser code should receive only non-secret derived data from an authenticated server endpoint.`,
  };
  if (item.kind === 'shared-server-env') return {
    ...base,
    action: 'split-shared-contract-from-server-implementation',
    summary: 'Keep shared code deterministic and secret-free; move server environment access into a server adapter and retain only types/schemas/contracts in shared.',
  };
  return { ...base, action: 'review-trust-boundary', summary: 'Review the client/server execution boundary using the attached AST/Merkle evidence.' };
}

export function analyzeExecutionBoundaries(semantic) {
  if (!semantic || !Array.isArray(semantic.entries)) throw new TypeError('agentsam-filemeta semantic metadata is required');
  const byPath = new Map(semantic.entries.map((entry) => [entry.path, entry]));
  const browserRoots = semantic.entries.filter((entry) => entry.type === 'file' && entry.execution_domain === 'browser');
  const reachable = new Map();
  const queue = browserRoots.map((entry) => ({ path: entry.path, root: entry.path }));
  for (const item of queue) reachable.set(item.path, item.root);
  const findings = [];
  const dedupe = new Set();
  const add = (item) => {
    const key = JSON.stringify([item.kind, item.source, item.target || '', item.specifier || '', item.env || '']);
    if (dedupe.has(key)) return;
    dedupe.add(key);
    findings.push({ ...item, repair: repairSuggestionForBoundaryFinding(item) });
  };

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const entry = byPath.get(current.path);
    if (!entry) continue;

    for (const edge of entry.resolved_imports || []) {
      if (!edge.target) continue;
      const target = byPath.get(edge.target);
      if (!target) continue;
      if (target.execution_domain === 'server') {
        add(finding('browser-server-import', entry, {
          target: target.path,
          target_hash: target.hash,
          specifier: edge.specifier,
          browser_root: current.root,
        }));
        continue;
      }
      if (target.execution_domain === 'framework') {
        if (!reachable.has(target.path)) reachable.set(target.path, current.root);
        continue;
      }
      if (!reachable.has(target.path)) {
        reachable.set(target.path, current.root);
        queue.push({ path: target.path, root: current.root });
      }
    }

    for (const specifier of entry.imports || []) {
      if (specifier.startsWith('.')) continue;
      const root = packageRoot(specifier);
      const normalized = specifier.replace(/^node:/, '');
      if (NODE_BUILTINS.has(normalized) || SERVER_PACKAGES.has(root)) {
        add(finding('browser-server-runtime-import', entry, { specifier, browser_root: current.root }));
      }
    }

    for (const access of entry.env_accesses || []) {
      const env = access.name;
      const publicName = PUBLIC_ENV_PREFIX.test(env);
      if (publicName && SECRETISH_ENV.test(env)) {
        add(finding('browser-public-secret-name', entry, { env, env_source: access.source, browser_root: current.root }));
      } else if (access.source === 'process.env' && !publicName) {
        add(finding('browser-private-env-access', entry, { env, env_source: access.source, browser_root: current.root }));
      }
    }
  }

  for (const entry of semantic.entries) {
    if (entry.execution_domain !== 'shared') continue;
    for (const access of entry.env_accesses || []) {
      if (access.source === 'process.env' || SECRETISH_ENV.test(access.name)) {
        add(finding('shared-server-env', entry, { env: access.name, env_source: access.source }));
      }
    }
  }

  findings.sort((a, b) => [a.source, a.kind, a.target || '', a.specifier || '', a.env || ''].join('\0').localeCompare([b.source, b.kind, b.target || '', b.specifier || '', b.env || ''].join('\0')));
  const astEntries = semantic.entries.filter((entry) => entry.ast?.indexed);
  const parseErrors = astEntries.filter((entry) => Number(entry.ast?.parse_error_count || 0) > 0).map((entry) => entry.path);
  return {
    schema_version: 1,
    analyzer: 'agentsam-execution-boundary',
    metadata_root: semantic.rootHash || null,
    classifier: semantic.classifier || null,
    complete: parseErrors.length === 0,
    status: parseErrors.length ? 'incomplete' : findings.length ? 'action-required' : 'clean',
    ok: parseErrors.length === 0 && findings.length === 0,
    browser_roots: browserRoots.length,
    browser_reachable_files: reachable.size,
    ast_files: astEntries.length,
    parse_errors: parseErrors,
    findings,
    repair_suggestions: findings.map((item) => item.repair),
  };
}
