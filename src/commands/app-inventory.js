import fs from 'node:fs';
import path from 'node:path';
import { listAppManifests } from '../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs';

const IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', '.output', 'target',
  'coverage', 'test', 'tests', 'fixtures', 'public',
]);

function relative(root, value) {
  return path.relative(root, value).split(path.sep).join('/');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error('Unable to read ' + file + ': ' + error.message);
  }
}

function walkManifestFiles(directory, filename, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = path.join(directory, entry.name);
    const candidate = path.join(child, filename);
    if (fs.existsSync(candidate)) output.push(candidate);
    walkManifestFiles(child, filename, output);
  }
  return output.sort();
}

function readPackage(directory) {
  const file = path.join(directory, 'package.json');
  return fs.existsSync(file) ? readJson(file) : null;
}

function routeEntrypoint(manifest) {
  const routes = manifest?.routes;
  if (typeof routes?.entry === 'string') return routes.entry;
  if (typeof routes?.['app.home']?.path === 'string') return routes['app.home'].path;
  if (typeof routes?.home === 'string') return routes.home;
  if (Array.isArray(routes) && typeof routes[0] === 'string') return routes[0];
  if (typeof manifest?.entrypoints?.frontend === 'string') return manifest.entrypoints.frontend;
  if (typeof manifest?.entry === 'string') return manifest.entry;
  return null;
}

function installDeclaration(manifest) {
  if (manifest?.distribution?.installable_external === true) return 'external-install-declared';
  if (manifest?.install?.supported === true) return 'install-supported-declared';
  if (manifest?.install?.supported === false || manifest?.installable === false) return 'not-independently-installable';
  if (typeof manifest?.install?.command === 'string') return 'install-command-declared';
  return 'not-declared';
}

function flattenImplementationPaths(implementation) {
  if (!implementation || typeof implementation !== 'object') return [];
  const output = [];
  for (const key of ['frontend', 'backend', 'migration', 'packages']) {
    const value = implementation[key];
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    for (const item of values) {
      if (typeof item === 'string' && item.trim() && !item.includes('*')) {
        output.push(item);
      }
    }
  }
  return [...new Set(output)];
}

function appRow(root, app) {
  const manifest = app.manifest;
  const packageJson = readPackage(app.dir);
  const manifestPackage = manifest.package || null;
  const npmPackage = packageJson?.name || null;
  const manifestVersion = manifest.version || null;
  const npmVersion = packageJson?.version || null;
  const directoryName = path.basename(app.dir);
  const directoryIdMatch = directoryName === app.id
    ? 'match'
    : manifest.directory_id_exception === true ? 'declared-exception' : 'mismatch';

  return {
    id: app.id,
    name: app.name,
    sourceDirectory: relative(root, app.dir),
    manifestPath: relative(root, app.manifestPath),
    package: {
      manifestName: manifestPackage,
      npmName: npmPackage,
      nameMatch: manifestPackage && npmPackage ? manifestPackage === npmPackage : null,
      manifestVersion,
      npmVersion,
      versionMatch: manifestVersion && npmVersion ? manifestVersion === npmVersion : null,
      private: packageJson?.private ?? null,
    },
    entrypoint: routeEntrypoint(manifest),
    screenCount: Array.isArray(manifest.screens) ? manifest.screens.length : 0,
    declaredModules: Array.isArray(manifest.modules) ? manifest.modules : [],
    installDeclaration: installDeclaration(manifest),
    distributionKind: manifest.distribution?.kind || null,
    releaseStatus: manifest.distribution?.release_status || null,
    directoryIdMatch,
    manifest,
  };
}

function packageManifestRow(root, file, appRoots) {
  const directory = path.dirname(file);
  const manifest = readJson(file);
  const packageJson = readPackage(directory);
  const ownerAppId = manifest.owner_app_id || null;
  const declaredHost = manifest.distribution?.owner_host || null;
  const effectiveHost = declaredHost || ownerAppId;
  const implementationRoot = (declaredHost && appRoots.get(declaredHost))
    || (ownerAppId && appRoots.get(ownerAppId))
    || directory;
  const implementationPaths = flattenImplementationPaths(manifest.implementation);
  const checkedPaths = implementationPaths.map((item) => ({
    path: item,
    exists: fs.existsSync(path.resolve(implementationRoot, item)),
  }));
  const missingImplementationPaths = checkedPaths.filter((item) => !item.exists).map((item) => item.path);

  return {
    id: manifest.id || path.basename(directory),
    name: manifest.name || packageJson?.name || path.basename(directory),
    kind: manifest.kind || 'supporting-package',
    role: manifest.role || null,
    sourceDirectory: relative(root, directory),
    manifestPath: relative(root, file),
    packageName: packageJson?.name || manifest.package || null,
    version: packageJson?.version || manifest.version || null,
    ownerAppId,
    declaredRuntimeHostAppId: declaredHost,
    runtimeHostAppId: effectiveHost,
    runtimeHostBasis: declaredHost ? 'distribution.owner_host' : ownerAppId ? 'owner_app_id/source ownership' : null,
    installable: manifest.installable ?? manifest.install?.supported ?? null,
    status: manifest.status || manifest.distribution?.kind || null,
    entrypoint: routeEntrypoint(manifest),
    implementationRoot: relative(root, implementationRoot),
    implementationPathCount: implementationPaths.length,
    missingImplementationPaths,
    manifest,
  };
}

function topLevelSourceRoots(root, appRows, appPackageRows) {
  const appByDirectory = new Map(appRows.map((row) => [row.sourceDirectory, row]));
  const packageByDirectory = new Map(appPackageRows.map((row) => [row.sourceDirectory, row]));
  const appsRoot = path.join(root, 'apps');
  if (!fs.existsSync(appsRoot)) return [];
  return fs.readdirSync(appsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
    .map((entry) => {
      const sourceDirectory = 'apps/' + entry.name;
      const app = appByDirectory.get(sourceDirectory);
      const packageRecord = packageByDirectory.get(sourceDirectory);
      return {
        directory: sourceDirectory,
        classification: app ? 'application' : packageRecord ? packageRecord.kind : 'source-only',
        identity: app?.id || packageRecord?.id || null,
        name: app?.name || packageRecord?.name || null,
      };
    })
    .sort((a, b) => a.directory.localeCompare(b.directory));
}

export function buildAppInventory(root) {
  const sourceRoot = path.resolve(root);
  const apps = listAppManifests(sourceRoot).map((app) => appRow(sourceRoot, app));
  const appRoots = new Map(apps.map((app) => [app.id, path.resolve(sourceRoot, app.sourceDirectory)]));

  const appPackageFiles = walkManifestFiles(path.join(sourceRoot, 'apps'), 'agentsam.package.json');
  const appPackages = appPackageFiles.map((file) => packageManifestRow(sourceRoot, file, appRoots));
  const modules = appPackages.filter((item) => item.kind === 'module');
  const providers = appPackages.filter((item) => item.kind === 'provider');
  const supportingPackages = appPackages.filter((item) => !['module', 'provider'].includes(item.kind));

  const sdkPackageFiles = walkManifestFiles(path.join(sourceRoot, 'packages'), 'agentsam.package.json');
  const sdkPackages = sdkPackageFiles.map((file) => {
    const directory = path.dirname(file);
    const manifest = readJson(file);
    const packageJson = readPackage(directory);
    return {
      id: manifest.id || path.basename(directory),
      name: manifest.name || packageJson?.name || path.basename(directory),
      sourceDirectory: relative(sourceRoot, directory),
      packageName: packageJson?.name || null,
      version: packageJson?.version || manifest.version || null,
    };
  });

  const coproPackages = sdkPackages.filter((item) => path.basename(item.sourceDirectory).startsWith('copro-'));
  const implementationFamilies = {
    copro: coproPackages,
    iamscene: sdkPackages.filter((item) => path.basename(item.sourceDirectory) === 'iamscene'),
    databaseEditor: sdkPackages.filter((item) => path.basename(item.sourceDirectory) === 'agentsam-database-editor'),
    workbench: sdkPackages.filter((item) => path.basename(item.sourceDirectory) === 'agentsam-workbench'),
  };

  const warnings = [];
  for (const app of apps) {
    if (app.directoryIdMatch === 'mismatch') {
      warnings.push('App ' + app.id + ' source directory ' + app.sourceDirectory + ' differs from its ID without directory_id_exception.');
    } else if (app.directoryIdMatch === 'declared-exception' && app.sourceDirectory.startsWith('apps/')) {
      warnings.push('App ' + app.id + ' uses the declared directory_id_exception for source directory ' + app.sourceDirectory + '.');
    }
    if (app.package.nameMatch === false) {
      warnings.push('App ' + app.id + ' manifest package ' + app.package.manifestName + ' differs from package.json name ' + app.package.npmName + '.');
    }
    if (app.package.versionMatch === false) {
      warnings.push('App ' + app.id + ' manifest version ' + app.package.manifestVersion + ' differs from package.json version ' + app.package.npmVersion + '.');
    }
    for (const module of app.declaredModules) {
      if (module.package && module.package === app.package.manifestName) {
        warnings.push('App ' + app.id + ' declares module ' + module.id + ' using the same npm package as its host application.');
      }
    }
  }
  const knownAppIds = new Set(apps.map((item) => item.id));
  for (const item of [...modules, ...providers]) {
    if (item.ownerAppId && !knownAppIds.has(item.ownerAppId)) {
      warnings.push(item.id + ' references unknown owner_app_id ' + item.ownerAppId + '.');
    }
    if (item.declaredRuntimeHostAppId && !knownAppIds.has(item.declaredRuntimeHostAppId)) {
      warnings.push(item.id + ' references unknown distribution.owner_host ' + item.declaredRuntimeHostAppId + '.');
    }
    if (item.missingImplementationPaths.length) {
      warnings.push(item.id + ' has implementation paths that do not resolve from ' + item.implementationRoot + '.');
    }
  }

  return {
    source: 'checked-in manifests and package.json files; no npm registry or production database lookup',
    counts: {
      applications: apps.length,
      modules: modules.length,
      providers: providers.length,
      appScopedSupportingPackages: supportingPackages.length,
      sdkPackages: sdkPackages.length,
      topLevelAppDirectories: topLevelSourceRoots(sourceRoot, apps, appPackages).length,
    },
    applications: apps,
    modules,
    providers,
    appScopedSupportingPackages: supportingPackages,
    sdkPackages,
    implementationFamilies,
    topLevelSourceRoots: topLevelSourceRoots(sourceRoot, apps, appPackages),
    warnings,
  };
}

function compact(value, width) {
  const text = value == null || value === '' ? '—' : String(value);
  return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '…' : text;
}

export function formatAppInventory(inventory, options = {}) {
  const lines = [];
  lines.push('');
  lines.push('AgentSam source inventory');
  lines.push('  Applications: ' + inventory.counts.applications
    + ' · modules: ' + inventory.counts.modules
    + ' · providers: ' + inventory.counts.providers
    + ' · app-scoped packages: ' + inventory.counts.appScopedSupportingPackages
    + ' · SDK packages: ' + inventory.counts.sdkPackages);
  lines.push('');
  lines.push('APPLICATION IDENTITIES (agentsam.app.json)');
  for (const app of inventory.applications) {
    lines.push('  ' + app.id.padEnd(24)
      + compact(app.sourceDirectory, 34).padEnd(35)
      + compact(app.package.npmName, 43).padEnd(44)
      + compact(app.entrypoint, 23).padEnd(24)
      + app.installDeclaration
      + ' · ' + (app.releaseStatus || app.distributionKind || 'release status not declared'));
  }
  lines.push('');
  lines.push('EMBEDDED MODULES (agentsam.package.json)');
  for (const item of inventory.modules) {
    lines.push('  ' + item.id.padEnd(20)
      + compact(item.sourceDirectory, 48).padEnd(49)
      + 'owner=' + (item.ownerAppId || '—')
      + ' · host=' + (item.runtimeHostAppId || '—')
      + ' · installable=' + (item.installable === null ? 'not declared' : String(item.installable))
      + ' · ' + (item.status || 'status not declared'));
  }
  lines.push('');
  lines.push('PROVIDER INTEGRATIONS');
  for (const item of inventory.providers) {
    lines.push('  ' + item.id.padEnd(20)
      + compact(item.sourceDirectory, 48).padEnd(49)
      + 'owner=' + (item.ownerAppId || '—')
      + ' · installable=' + (item.installable === null ? 'not declared' : String(item.installable)));
  }
  lines.push('');
  lines.push('APP-SCOPED SUPPORTING PACKAGES');
  for (const item of inventory.appScopedSupportingPackages) {
    lines.push('  ' + item.id.padEnd(24) + compact(item.sourceDirectory, 56));
  }
  lines.push('');
  lines.push('IMPLEMENTATION PACKAGE FAMILIES');
  lines.push('  CoPro (' + inventory.implementationFamilies.copro.length + '): '
    + inventory.implementationFamilies.copro.map((item) => path.basename(item.sourceDirectory)).join(', '));
  lines.push('  SamScene engine: '
    + (inventory.implementationFamilies.iamscene[0]?.sourceDirectory || 'no package manifest found'));
  lines.push('  Database Editor capability: '
    + (inventory.implementationFamilies.databaseEditor[0]?.sourceDirectory || 'no package manifest found'));
  lines.push('  Workbench: '
    + (inventory.implementationFamilies.workbench[0]?.sourceDirectory || 'no package manifest found'));
  lines.push('');
  lines.push('TOP-LEVEL apps/ SOURCE DIRECTORIES');
  for (const item of inventory.topLevelSourceRoots) {
    lines.push('  ' + item.directory.padEnd(38) + item.classification
      + (item.identity ? ' · ' + item.identity : ''));
  }
  if (options.allPackages) {
    lines.push('');
    lines.push('ALL PACKAGE-OWNED SDK MANIFESTS');
    for (const item of inventory.sdkPackages) {
      lines.push('  ' + item.id.padEnd(34) + compact(item.sourceDirectory, 52).padEnd(53)
        + compact(item.packageName, 48) + ' · ' + (item.version || 'version not declared'));
    }
  }
  if (inventory.warnings.length) {
    lines.push('');
    lines.push('REVIEW FLAGS');
    for (const warning of inventory.warnings) lines.push('  ! ' + warning);
  }
  lines.push('');
  lines.push('Note: app manifests establish source identities, not proof of installability, npm publication, deployment, or runtime health.');
  lines.push('Use --json for the complete machine-readable inventory; use --packages to list all SDK package manifests.');
  lines.push('');
  return lines.join('\n');
}
