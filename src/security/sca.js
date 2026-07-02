import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'package.json',
];

const DEFAULT_OSV_ENDPOINT = 'https://api.osv.dev/v1/querybatch';

function hasNodeFs() {
  return Boolean(fs?.existsSync && fs?.readFileSync);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function normalizePackageName(name = '') {
  return String(name).replace(/^node_modules\//, '').trim();
}

function addDependency(map, dependency) {
  const name = normalizePackageName(dependency.name);
  const version = String(dependency.version || '').trim();
  if (!name || !version || version.startsWith('file:') || version.startsWith('link:')) return;

  const key = `${name}@${version}`;
  const existing = map.get(key) || {
    ecosystem: 'npm',
    name,
    version,
    direct: false,
    paths: [],
    source_files: [],
  };

  existing.direct ||= Boolean(dependency.direct);
  if (dependency.path && !existing.paths.includes(dependency.path)) existing.paths.push(dependency.path);
  if (dependency.source && !existing.source_files.includes(dependency.source)) existing.source_files.push(dependency.source);
  map.set(key, existing);
}

function collectPackageJsonDependencies(projectRoot, map) {
  const filePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(filePath)) return;

  const pkg = readJson(filePath);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = pkg[field] || {};
    for (const [name, range] of Object.entries(deps)) {
      addDependency(map, {
        name,
        version: String(range).replace(/^[~^><= ]+/, ''),
        direct: true,
        path: `package.json:${field}`,
        source: 'package.json',
      });
    }
  }
}

function collectPackageLockDependencies(projectRoot, lockfileName, map) {
  const filePath = path.join(projectRoot, lockfileName);
  if (!fs.existsSync(filePath)) return;

  const lock = readJson(filePath);
  const rootDeps = new Set([
    ...Object.keys(lock.dependencies || {}),
    ...Object.keys(lock.packages?.['']?.dependencies || {}),
    ...Object.keys(lock.packages?.['']?.devDependencies || {}),
  ]);

  if (lock.packages) {
    for (const [pkgPath, pkg] of Object.entries(lock.packages)) {
      if (!pkgPath || !pkg?.version) continue;
      const name = pkg.name || normalizePackageName(pkgPath.split('node_modules/').pop());
      addDependency(map, {
        name,
        version: pkg.version,
        direct: rootDeps.has(name),
        path: pkgPath,
        source: lockfileName,
      });
    }
  }

  if (lock.dependencies) {
    for (const [name, pkg] of Object.entries(lock.dependencies)) {
      if (!pkg?.version) continue;
      addDependency(map, {
        name,
        version: pkg.version,
        direct: rootDeps.has(name),
        path: `dependencies.${name}`,
        source: lockfileName,
      });
    }
  }
}

function collectPnpmLockDependencies(projectRoot, map) {
  const filePath = path.join(projectRoot, 'pnpm-lock.yaml');
  if (!fs.existsSync(filePath)) return;

  const text = readText(filePath);
  const packageMatches = text.matchAll(/^\s{2}\/?((?:@[^/]+\/)?[^/@\s:]+)@([^:\s]+):/gm);
  for (const match of packageMatches) {
    addDependency(map, {
      name: match[1],
      version: match[2].replace(/\(.+\)$/, ''),
      direct: false,
      path: `packages.${match[1]}`,
      source: 'pnpm-lock.yaml',
    });
  }
}

function collectYarnLockDependencies(projectRoot, map) {
  const filePath = path.join(projectRoot, 'yarn.lock');
  if (!fs.existsSync(filePath)) return;

  const text = readText(filePath);
  const blocks = text.split(/\n(?=\S)/g);
  for (const block of blocks) {
    const header = block.split('\n')[0] || '';
    const version = block.match(/\n\s+version\s+"?([^"\n]+)"?/)?.[1];
    if (!version) continue;

    const spec = header.split(',')[0].trim().replace(/^"|":?$/g, '').replace(/:$/, '');
    const atIndex = spec.startsWith('@') ? spec.indexOf('@', 1) : spec.indexOf('@');
    const name = atIndex > 0 ? spec.slice(0, atIndex) : spec;

    addDependency(map, {
      name,
      version,
      direct: false,
      path: header,
      source: 'yarn.lock',
    });
  }
}

export function findSecurityManifests(projectRoot = process.cwd()) {
  if (!hasNodeFs()) return [];
  return SUPPORTED_LOCKFILES
    .filter((file) => fs.existsSync(path.join(projectRoot, file)))
    .map((file) => ({ file, path: path.join(projectRoot, file) }));
}

export function collectNpmDependencies(projectRoot = process.cwd()) {
  if (!hasNodeFs()) return [];

  const map = new Map();
  collectPackageLockDependencies(projectRoot, 'package-lock.json', map);
  collectPackageLockDependencies(projectRoot, 'npm-shrinkwrap.json', map);
  collectPnpmLockDependencies(projectRoot, map);
  collectYarnLockDependencies(projectRoot, map);

  if (map.size === 0) collectPackageJsonDependencies(projectRoot, map);

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function createOsvQueries(dependencies) {
  return dependencies.map((dep) => ({
    package: { ecosystem: dep.ecosystem || 'npm', name: dep.name },
    version: dep.version,
  }));
}

export async function queryOsv(dependencies, options = {}) {
  if (!dependencies.length) return [];
  const endpoint = options.endpoint || DEFAULT_OSV_ENDPOINT;
  const fetchImpl = options.fetch || globalThis.fetch;
  if (!fetchImpl) return [];

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ queries: createOsvQueries(dependencies) }),
  });

  if (!response.ok) {
    throw new Error(`OSV query failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.results || [];
}

function highestSeverity(vulnerabilities = []) {
  const order = ['LOW', 'MODERATE', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let best = 'UNKNOWN';

  for (const vuln of vulnerabilities) {
    const explicit = vuln.database_specific?.severity || vuln.severity?.[0]?.score || '';
    const value = String(explicit).toUpperCase();
    const normalized = value === 'MEDIUM' ? 'MODERATE' : value;
    if (order.indexOf(normalized) > order.indexOf(best)) best = normalized;
  }

  return best;
}

export function summarizeVulnerabilities(dependencies, osvResults = []) {
  return dependencies.map((dependency, index) => {
    const vulnerabilities = osvResults[index]?.vulns || [];
    return {
      ...dependency,
      vulnerability_count: vulnerabilities.length,
      highest_severity: vulnerabilities.length ? highestSeverity(vulnerabilities) : null,
      vulnerabilities: vulnerabilities.map((vuln) => ({
        id: vuln.id,
        summary: vuln.summary || vuln.details || '',
        aliases: vuln.aliases || [],
        severity: vuln.database_specific?.severity || vuln.severity || null,
        fixed: vuln.affected?.flatMap((affected) => affected.ranges || [])
          .flatMap((range) => range.events || [])
          .filter((event) => event.fixed)
          .map((event) => event.fixed),
      })),
    };
  });
}

export function formatSecurityReport(report) {
  const lines = [];
  lines.push(`AgentSam Security Scan: ${report.project_root}`);
  lines.push(`Manifests: ${report.manifests.map((m) => m.file).join(', ') || 'none'}`);
  lines.push(`Dependencies: ${report.dependency_count}`);
  lines.push(`Vulnerable packages: ${report.vulnerable_count}`);

  for (const item of report.results.filter((r) => r.vulnerability_count > 0)) {
    lines.push('');
    lines.push(`${item.name}@${item.version} — ${item.highest_severity || 'UNKNOWN'} (${item.vulnerability_count})`);
    lines.push(`Source: ${item.source_files.join(', ') || 'unknown'}${item.direct ? ' · direct' : ' · transitive'}`);
    for (const vuln of item.vulnerabilities.slice(0, 5)) {
      lines.push(`- ${vuln.id}: ${vuln.summary}`.trim());
      if (vuln.fixed?.length) lines.push(`  Fix: upgrade to ${[...new Set(vuln.fixed)].join(' or ')}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function scanProjectSecurity(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || options.path || process.cwd());
  const manifests = findSecurityManifests(projectRoot);
  const dependencies = collectNpmDependencies(projectRoot);

  const shouldQueryOsv = options.queryOsv !== false;
  const osvResults = shouldQueryOsv ? await queryOsv(dependencies, options) : [];
  const results = summarizeVulnerabilities(dependencies, osvResults);
  const vulnerableCount = results.filter((item) => item.vulnerability_count > 0).length;

  return {
    ok: vulnerableCount === 0,
    scanner: 'agentsam-sca',
    project_root: projectRoot,
    manifests,
    dependency_count: dependencies.length,
    vulnerable_count: vulnerableCount,
    results,
  };
}
