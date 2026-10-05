#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPackageManifests } from '../src/commands/package.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const intentOnly = args.has('--intent-only');
const json = args.has('--json');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stable(nested)])
    );
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

async function npmView(name, version, field) {
  const spec = name + '@' + version;
  const command = ['view', spec];
  if (field) command.push(field);
  command.push('--json');
  try {
    const { stdout } = await execFileAsync('npm', command, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    const text = stdout.trim();
    return { ok: true, value: text ? JSON.parse(text) : null };
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? null,
      stderr: String(error?.stderr || '').trim(),
    };
  }
}

const manifests = collectPackageManifests(root);
const ambiguous = manifests.filter(
  (pkg) => pkg.manifest.private !== true && pkg.manifest.publishConfig?.access !== 'public'
);
const publicPackages = manifests.filter(
  (pkg) => pkg.manifest.private !== true && pkg.manifest.publishConfig?.access === 'public'
);

const report = {
  schema: 'agentsam.registry-train.v1',
  intent_ok: ambiguous.length === 0,
  public_packages: publicPackages.length,
  ambiguous: ambiguous.map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    path: pkg.relativeDir,
  })),
  registry_checked: !intentOnly,
  aligned: [],
  missing: [],
  export_drift: [],
};

if (!intentOnly) {
  const concurrency = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < publicPackages.length) {
      const index = cursor++;
      const pkg = publicPackages[index];
      const versionResult = await npmView(pkg.name, pkg.version, 'version');
      if (!versionResult.ok || versionResult.value !== pkg.version) {
        report.missing.push({
          name: pkg.name,
          version: pkg.version,
          path: pkg.relativeDir,
        });
        continue;
      }

      if (pkg.manifest.exports !== undefined) {
        const exportsResult = await npmView(pkg.name, pkg.version, 'exports');
        const registryExports = exportsResult.ok ? exportsResult.value : undefined;
        if (!exportsResult.ok || !same(pkg.manifest.exports, registryExports)) {
          report.export_drift.push({
            name: pkg.name,
            version: pkg.version,
            path: pkg.relativeDir,
            local: pkg.manifest.exports,
            registry: registryExports,
          });
          continue;
        }
      }

      report.aligned.push({
        name: pkg.name,
        version: pkg.version,
        path: pkg.relativeDir,
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

report.aligned.sort((a, b) => a.name.localeCompare(b.name));
report.missing.sort((a, b) => a.name.localeCompare(b.name));
report.export_drift.sort((a, b) => a.name.localeCompare(b.name));

const ok =
  report.intent_ok &&
  (intentOnly || (report.missing.length === 0 && report.export_drift.length === 0));

if (json) {
  console.log(JSON.stringify({ ...report, ok }, null, 2));
} else {
  console.log('AgentSam registry train');
  console.log(
    '  public ' + report.public_packages +
    ' · explicit intent ' + (report.intent_ok ? 'PASS' : 'FAIL')
  );
  for (const pkg of report.ambiguous) {
    console.error('  AMBIGUOUS ' + pkg.name + '@' + pkg.version + ' · ' + pkg.path);
  }

  if (!intentOnly) {
    console.log(
      '  registry aligned ' + report.aligned.length +
      ' · missing ' + report.missing.length +
      ' · export drift ' + report.export_drift.length
    );
    for (const pkg of report.missing) {
      console.error('  MISSING ' + pkg.name + '@' + pkg.version + ' · ' + pkg.path);
    }
    for (const pkg of report.export_drift) {
      console.error('  EXPORT_DRIFT ' + pkg.name + '@' + pkg.version + ' · ' + pkg.path);
    }
  }
  console.log(ok ? '  PASS registry train aligned' : '  FAIL registry train drift detected');
}

if (!ok) process.exitCode = 1;
