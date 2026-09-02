import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const exactVersion = (v) => typeof v === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
export const packageName = (v) => typeof v === 'string' && /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(v);
const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
export const declarations = (pkg) => Object.assign({}, ...fields.map(k => pkg[k] || {}));
export function readJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Manifest must be a regular JSON file under 32 MiB');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function collectNpmDependencies(projectRoot = process.cwd()) {
  const root = fs.realpathSync(projectRoot);
  const manifest = readJson(path.join(root, 'package.json'));
  const issues = [], dependencies = new Map(), skipped = [];
  const locks = ['npm-shrinkwrap.json', 'package-lock.json'];
  const lockfile = locks.find(file => fs.existsSync(path.join(root, file)));
  const unsupported = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'].filter(file => fs.existsSync(path.join(root, file)));
  if (manifest.packageManager && !manifest.packageManager.startsWith('npm@')) issues.push('Selected package manager is not npm; this adapter cannot prove its dependency graph.');
  else if (unsupported.length && !manifest.packageManager) issues.push('Multiple/unsupported package-manager lockfiles; select npm explicitly with packageManager or scan in the owning manager.');
  const add = (name, pkg, location, direct) => {
    if (pkg.link) { skipped.push({ path: location, reason: 'workspace/link (dependencies scanned from lock graph)' }); return; }
    if (!packageName(name) || !exactVersion(pkg.version) || /^(?:file:|link:|git[+:]|https?:\/\/.*\.git)/i.test(pkg.resolved || '')) {
      issues.push('Unresolved or non-registry dependency at ' + location);
      return;
    }
    const key = name + '@' + pkg.version;
    const item = dependencies.get(key) || { name, version: pkg.version, ecosystem: 'npm', direct: false, paths: [], deprecated: false };
    item.direct ||= direct;
    item.paths.push(location);
    item.deprecated ||= Boolean(pkg.deprecated);
    dependencies.set(key, item);
  };
  let fingerprint = null;
  if (lockfile) {
    const lock = readJson(path.join(root, lockfile));
    fingerprint = createHash('sha256').update(fs.readFileSync(path.join(root, lockfile))).digest('hex');
    if (![1, 2, 3].includes(lock.lockfileVersion)) issues.push('Unsupported npm lockfile version');
    else if (lock.lockfileVersion >= 2) {
      if (!lock.packages || typeof lock.packages !== 'object' || !lock.packages['']) throw new Error('Malformed npm lockfile: packages root missing');
      for (const field of fields) {
        if (JSON.stringify(Object.entries(manifest[field] || {}).sort()) !== JSON.stringify(Object.entries(lock.packages[''][field] || {}).sort())) {
          issues.push('Manifest and lockfile disagree on ' + field);
        }
      }
      for (const [location, pkg] of Object.entries(lock.packages)) {
        if (!location || !location.includes('node_modules/')) continue;
        if (pkg.link && (!pkg.resolved || !lock.packages[pkg.resolved] || pkg.resolved.includes('..') || path.isAbsolute(pkg.resolved))) issues.push('Unresolved local link: ' + location);
        const installedName = location.split('node_modules/').at(-1);
        const parent = location.slice(0, location.lastIndexOf('node_modules/')).replace(/\/$/, '');
        const owner = lock.packages[parent] || {};
        const direct = !parent || !parent.includes('node_modules/');
        add(pkg.name || installedName, pkg, location, direct && installedName in declarations(owner));
      }
      // Missing direct locked entries must never look like an empty, clean graph.
      for (const [location, pkg] of Object.entries(lock.packages)) {
        if (location.includes('node_modules/')) continue;
        if (location) {
          const workspacePath = path.resolve(root, location);
          const relative = path.relative(root, fs.realpathSync(workspacePath));
          if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Workspace escapes project root');
          const workspace = readJson(path.join(workspacePath, 'package.json'));
          for (const field of fields) {
            if (JSON.stringify(Object.entries(workspace[field] || {}).sort()) !== JSON.stringify(Object.entries(pkg[field] || {}).sort())) issues.push('Workspace manifest and lockfile disagree: ' + location + ':' + field);
          }
        }
        for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
          if (name in (pkg.optionalDependencies || {})) continue;
          const found = Object.keys(lock.packages).some(p => p === 'node_modules/' + name || p === location + '/node_modules/' + name);
          if (!found) issues.push('Missing locked dependency: ' + name);
        }
      }
    } else {
      const walk = (deps, parent = '') => {
        for (const [name, pkg] of Object.entries(deps || {})) {
          const location = parent + 'node_modules/' + name;
          add(name, pkg, location, !parent && name in declarations(manifest));
          walk(pkg.dependencies, location + '/');
        }
      };
      walk(lock.dependencies);
      for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
        if (!(name in (lock.dependencies || {})) && !(name in (manifest.optionalDependencies || {}))) issues.push('Missing locked dependency: ' + name);
      }
    }
  } else {
    issues.push('No npm lockfile: transitive dependency coverage is unknown. Generate a lockfile with the owning package manager.');
    for (const [name, version] of Object.entries(declarations(manifest))) add(name, { version }, 'package.json:' + name, true);
  }
  return { root, lockfile: lockfile || null, fingerprint, dependencies: [...dependencies.values()].sort((a,b) => (a.name+'@'+a.version).localeCompare(b.name+'@'+b.version)), issues: [...new Set(issues)], skipped };
}
