import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set([
  '.git', '.agentsam', '.output', '.wrangler', 'node_modules', 'python_modules',
  'dist', 'build', 'coverage', 'target', 'vendor',
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function packageEntrypoints(manifest) {
  const values = [];
  if (typeof manifest.main === 'string') values.push(manifest.main);
  if (typeof manifest.module === 'string') values.push(manifest.module);
  if (typeof manifest.types === 'string') values.push(manifest.types);
  if (typeof manifest.bin === 'string') values.push(manifest.bin);
  if (manifest.bin && typeof manifest.bin === 'object') values.push(...Object.values(manifest.bin));
  const walkExports = (value) => {
    if (typeof value === 'string') values.push(value);
    else if (value && typeof value === 'object') for (const nested of Object.values(value)) walkExports(nested);
  };
  walkExports(manifest.exports);
  return [...new Set(values.filter((v) => typeof v === 'string' && v.startsWith('./')))];
}

function internalDependencies(manifest) {
  const groups = ['dependencies', 'optionalDependencies', 'peerDependencies'];
  const out = {};
  for (const group of groups) {
    for (const [name, version] of Object.entries(manifest[group] || {})) {
      if (name.startsWith('@inneranimalmedia/')) out[name] = { version, group };
    }
  }
  return out;
}

export function collectPackageManifests(root = SDK_ROOT) {
  const found = [];

  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      visit(path.join(dir, entry.name));
    }

    const manifestPath = path.join(dir, 'package.json');
    if (!fs.existsSync(manifestPath)) return;

    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch {
      return;
    }

    if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@inneranimalmedia/')) return;

    found.push({
      name: manifest.name,
      version: manifest.version || null,
      dir,
      relativeDir: path.relative(root, dir) || '.',
      manifestPath,
      manifest,
    });
  };

  visit(root);
  return found.sort((a, b) => a.name.localeCompare(b.name) || a.relativeDir.localeCompare(b.relativeDir));
}

export function classifyPackage(pkg, registry = null) {
  const { manifest } = pkg;
  const isPrivate = manifest.private === true;
  const publicAccess = manifest.publishConfig?.access === 'public';
  const publicIntent = !isPrivate && publicAccess;
  const entrypoints = packageEntrypoints(manifest);
  const missingEntrypoints = entrypoints.filter((entry) => {
    if (entry.includes('*')) {
      const base = entry.slice(0, entry.indexOf('*')).replace(/\/$/, '');
      return !fs.existsSync(path.resolve(pkg.dir, base));
    }
    return !fs.existsSync(path.resolve(pkg.dir, entry));
  });
  const structuralBlockers = [];

  if (!manifest.version) structuralBlockers.push('missing version');
  if (publicIntent && !manifest.description) structuralBlockers.push('missing description');
  if (publicIntent && !manifest.license) structuralBlockers.push('missing license');
  if (publicIntent && !manifest.repository) structuralBlockers.push('missing repository metadata');
  if (publicIntent && !Array.isArray(manifest.files)) structuralBlockers.push('missing files allowlist');

  const rawTypeScriptEntrypoints = entrypoints.filter(
    (entry) => (entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')
  );
  const explicitSourceDistribution = manifest.agentsam?.distribution?.source === true;
  if (publicIntent && rawTypeScriptEntrypoints.length && !explicitSourceDistribution) {
    structuralBlockers.push(
      `raw TypeScript entrypoints require a build or agentsam.distribution.source=true: ${rawTypeScriptEntrypoints.join(', ')}`
    );
  }
  if (missingEntrypoints.length && !manifest.scripts?.build) {
    structuralBlockers.push(`missing entrypoints: ${missingEntrypoints.join(', ')}`);
  }

  const localPublished = registry?.localPublished === true;
  const latest = registry?.latest || null;

  let state = 'internal';
  if (isPrivate) state = 'private';
  else if (publicIntent && registry?.checked === false && structuralBlockers.length) state = 'public_manifest_incomplete';
  else if (publicIntent && registry?.checked === false) state = 'public_candidate_unchecked';
  else if (publicIntent && localPublished && structuralBlockers.length) state = 'published_nonconformant';
  else if (publicIntent && localPublished) state = 'published_current';
  else if (publicIntent && latest && structuralBlockers.length) state = 'published_stale_nonconformant';
  else if (publicIntent && latest) state = 'published_stale';
  else if (publicIntent && structuralBlockers.length) state = 'public_manifest_incomplete';
  else if (publicIntent) state = 'public_unpublished';

  return {
    schema: 'agentsam.package.status.v1',
    name: pkg.name,
    version: pkg.version,
    path: pkg.relativeDir,
    private: isPrivate,
    public_access: publicAccess,
    public_intent: publicIntent,
    state,
    registry: registry || { checked: false, localPublished: false, latest: null },
    entrypoints,
    internal_dependencies: internalDependencies(manifest),
    scripts: {
      build: Boolean(manifest.scripts?.build),
      typecheck: Boolean(manifest.scripts?.typecheck),
      test: Boolean(manifest.scripts?.test),
    },
    structural_blockers: structuralBlockers,
    build_outputs_missing: missingEntrypoints,
    raw_typescript_entrypoints: rawTypeScriptEntrypoints,
    source_distribution: explicitSourceDistribution,
    verification_required: publicIntent && !isPrivate,
  };
}

async function registryLookup(pkg, offline = false) {
  if (offline) return { checked: false, localPublished: false, latest: null };

  const lookup = async (spec) => {
    try {
      const { stdout } = await execFileAsync('npm', ['view', spec, 'version', '--json'], {
        cwd: SDK_ROOT,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
      const raw = String(stdout || '').trim();
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.at(-1) : parsed;
    } catch {
      return null;
    }
  };

  const [exact, latest] = await Promise.all([
    pkg.version ? lookup(`${pkg.name}@${pkg.version}`) : Promise.resolve(null),
    lookup(pkg.name),
  ]);

  return {
    checked: true,
    localPublished: exact === pkg.version,
    exact,
    latest,
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function auditPackages({ root = SDK_ROOT, publicOnly = false, offline = false } = {}) {
  let packages = collectPackageManifests(root);
  if (publicOnly) {
    packages = packages.filter((pkg) =>
      pkg.manifest.private !== true &&
      pkg.manifest.publishConfig?.access === 'public'
    );
  }

  const statuses = await mapLimit(
    packages,
    6,
    async (pkg) => classifyPackage(pkg, await registryLookup(pkg, offline)),
  );

  const counts = {};
  for (const status of statuses) counts[status.state] = (counts[status.state] || 0) + 1;

  return {
    schema: 'agentsam.package.audit.v1',
    root,
    offline,
    public_only: publicOnly,
    total: statuses.length,
    counts,
    packages: statuses,
  };
}

function topologicalPublishOrder(statuses) {
  const candidates = statuses.filter((status) =>
    status.public_intent &&
    !status.private &&
    status.structural_blockers.length === 0 &&
    ['public_unpublished', 'published_stale', 'public_candidate_unchecked'].includes(status.state)
  );

  const byName = new Map(candidates.map((status) => [status.name, status]));
  const indegree = new Map(candidates.map((status) => [status.name, 0]));
  const dependents = new Map(candidates.map((status) => [status.name, []]));

  for (const status of candidates) {
    for (const dep of Object.keys(status.internal_dependencies)) {
      if (!byName.has(dep)) continue;
      indegree.set(status.name, indegree.get(status.name) + 1);
      dependents.get(dep).push(status.name);
    }
  }

  const ready = candidates
    .filter((status) => indegree.get(status.name) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const ordered = [];

  while (ready.length) {
    const current = ready.shift();
    ordered.push(current);

    for (const child of dependents.get(current.name)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        ready.push(byName.get(child));
        ready.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  const orderedNames = new Set(ordered.map((status) => status.name));
  const cycle = candidates.filter((status) => !orderedNames.has(status.name)).map((status) => status.name);

  return { ordered, cycle };
}

export async function buildPublishPlan({ root = SDK_ROOT, offline = false } = {}) {
  const audit = await auditPackages({ root, publicOnly: true, offline });
  const { ordered, cycle } = topologicalPublishOrder(audit.packages);

  const blocked = audit.packages.filter((status) =>
    status.structural_blockers.length > 0 ||
    cycle.includes(status.name)
  );

  return {
    schema: 'agentsam.package.publish-plan.v1',
    offline,
    registry_checked: !offline,
    publish_order: ordered.map((status, index) => ({
      order: index + 1,
      name: status.name,
      version: status.version,
      state: status.state,
      path: status.path,
      verification_required: true,
    })),
    blocked: blocked.map((status) => ({
      name: status.name,
      version: status.version,
      state: status.state,
      path: status.path,
      blockers: [
        ...status.structural_blockers,
        ...(cycle.includes(status.name) ? ['internal dependency cycle'] : []),
      ],
    })),
  };
}

function runGate(pkg, script) {
  const proc = spawnSync('npm', ['--prefix', pkg.dir, 'run', script], {
    cwd: SDK_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  return {
    gate: script,
    ok: proc.status === 0,
    exit_code: proc.status,
    stdout: String(proc.stdout || '').trim().slice(-4000),
    stderr: String(proc.stderr || '').trim().slice(-4000),
  };
}

function runPackDryRun(pkg) {
  const proc = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: pkg.dir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  let artifact = null;

  if (proc.status === 0) {
    try {
      const parsed = JSON.parse(proc.stdout);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      artifact = {
        name: first?.name,
        version: first?.version,
        filename: first?.filename,
        size: first?.size,
        unpacked_size: first?.unpackedSize,
        files: first?.files?.length,
      };
    } catch {}
  }

  return {
    gate: 'pack',
    ok: proc.status === 0,
    exit_code: proc.status,
    artifact,
    stdout: String(proc.stdout || '').trim().slice(-4000),
    stderr: String(proc.stderr || '').trim().slice(-4000),
  };
}

export async function verifyPackage(name, { root = SDK_ROOT, offline = false } = {}) {
  const pkg = collectPackageManifests(root).find((item) => item.name === name);
  if (!pkg) throw new Error(`Unknown @inneranimalmedia package: ${name}`);

  const registry = await registryLookup(pkg, offline);
  const gates = [];

  for (const gate of ['build', 'typecheck', 'test']) {
    if (pkg.manifest.scripts?.[gate]) gates.push(runGate(pkg, gate));
  }

  gates.push(runPackDryRun(pkg));

  const status = classifyPackage(pkg, registry);
  const blockers = [...status.structural_blockers];
  for (const gate of gates) {
    if (!gate.ok) blockers.push(`${gate.gate} failed`);
  }

  return {
    schema: 'agentsam.package.verify.v1',
    package: status,
    ok: blockers.length === 0,
    blockers,
    gates,
  };
}

function parseArgs(argv) {
  const positional = [];
  const flags = new Set();

  for (const arg of argv) {
    if (arg.startsWith('--') || arg === '-h') flags.add(arg);
    else positional.push(arg);
  }

  return { positional, flags };
}

function printHelp() {
  console.log(`agentsam package — audit and graduate distributable packages

Usage:
  agentsam package audit [--public] [--offline] [--json]
  agentsam package status <@inneranimalmedia/name> [--offline] [--json]
  agentsam package verify <@inneranimalmedia/name> [--offline] [--json]
  agentsam package publish-plan [--offline] [--json]

Read-only: this command never publishes packages.`);
}

function printAudit(report) {
  console.log(`AgentSam package audit · ${report.total} package(s)`);
  for (const [state, count] of Object.entries(report.counts).sort()) {
    console.log(`  ${state.padEnd(28)} ${count}`);
  }

  console.log('');

  for (const pkg of report.packages) {
    const registry = pkg.registry.checked ? (pkg.registry.latest || 'unpublished') : 'not checked';
    const blocker = pkg.structural_blockers.length
      ? ` · blockers: ${pkg.structural_blockers.join('; ')}`
      : '';
    console.log(`${pkg.name}@${pkg.version || '?'} · ${pkg.state} · registry ${registry}${blocker}`);
  }
}

function printStatus(status) {
  console.log(`${status.name}@${status.version || '?'}`);
  console.log(`  path       ${status.path}`);
  console.log(`  state      ${status.state}`);
  console.log(`  public     ${status.public_intent ? 'yes' : 'no'}`);
  console.log(`  registry   ${status.registry.checked ? (status.registry.latest || 'unpublished') : 'not checked'}`);
  console.log(`  scripts    ${Object.entries(status.scripts).filter(([, value]) => value).map(([key]) => key).join(', ') || 'none'}`);
  console.log(`  blockers   ${status.structural_blockers.join('; ') || 'none'}`);
}

function printVerify(report) {
  printStatus(report.package);
  console.log('');

  for (const gate of report.gates) {
    console.log(`  ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.gate}`);
  }

  console.log(`  ${report.ok ? 'READY' : 'BLOCKED'} ${report.blockers.join('; ') || 'all declared gates passed'}`);
}

function printPlan(plan) {
  console.log(`AgentSam package publish plan · ${plan.publish_order.length} candidate(s)`);

  for (const row of plan.publish_order) {
    console.log(`  ${String(row.order).padStart(2)}. ${row.name}@${row.version} · ${row.state} · verify required`);
  }

  if (plan.blocked.length) {
    console.log('');
    console.log('Blocked:');
    for (const row of plan.blocked) {
      console.log(`  ${row.name}@${row.version} · ${row.blockers.join('; ') || row.state}`);
    }
  }
}

export async function runPackage(argv = []) {
  const { positional, flags } = parseArgs(argv);
  const sub = positional[0];
  const json = flags.has('--json');
  const offline = flags.has('--offline');

  if (!sub || flags.has('--help') || flags.has('-h')) {
    printHelp();
    return;
  }

  if (sub === 'audit') {
    const report = await auditPackages({
      publicOnly: flags.has('--public'),
      offline,
    });

    if (json) console.log(JSON.stringify(report, null, 2));
    else printAudit(report);
    return;
  }

  if (sub === 'status') {
    const name = positional[1];
    if (!name) throw new Error('package status requires a package name');

    const pkg = collectPackageManifests().find((item) => item.name === name);
    if (!pkg) throw new Error(`Unknown @inneranimalmedia package: ${name}`);

    const status = classifyPackage(pkg, await registryLookup(pkg, offline));

    if (json) console.log(JSON.stringify(status, null, 2));
    else printStatus(status);
    return;
  }

  if (sub === 'verify') {
    const name = positional[1];
    if (!name) throw new Error('package verify requires a package name');

    const report = await verifyPackage(name, { offline });

    if (json) console.log(JSON.stringify(report, null, 2));
    else printVerify(report);

    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (sub === 'publish-plan') {
    const plan = await buildPublishPlan({ offline });

    if (json) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
    return;
  }

  throw new Error(`Unknown package subcommand: ${sub}`);
}
