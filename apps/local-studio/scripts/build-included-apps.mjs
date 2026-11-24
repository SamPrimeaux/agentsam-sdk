#!/usr/bin/env node
/**
 * Build and stage every independently embedded app named in the desktop brand manifest.
 * Host-component screens are already compiled into Local Studio and do not need a
 * second standalone asset bundle. Other included apps declare how they are built
 * and where they are served from in their own agentsam.app.json:
 *
 *   "embed": {
 *     "stage": "cad-creator",            // served at /<stage>/, staged as frontend/public/<stage>
 *     "build": {
 *       "cwd": ".",                      // relative to the app directory
 *       "install": { "lockfile": "package-lock.json",
 *                    "check": ["node_modules/vite/package.json"],
 *                    "command": ["npm", "ci"] },
 *       "command": ["npm", "run", "build", "--", "--base={base}"],   // {base} = "/<stage>/"
 *       "output": "frontend/dist"        // relative to cwd
 *     }
 *   }
 *
 * Apps are discovered with listAppManifests() — the same discovery `agentsam app validate` uses.
 * To ship another independently embedded app with Local Studio: add its id to
 * `included_apps` and give it an `embed.build` block. Host-component-only apps
 * are bundled by the host screen module and need no separate embed build.
 *
 * Usage (from apps/local-studio):
 *   node scripts/build-included-apps.mjs                 refuse implicit all-product rebuild
 *   node scripts/build-included-apps.mjs --stage         copy frontend/public/<stage> into .output/public/<stage>
 *   node scripts/build-included-apps.mjs --dry-run       print the resolved plan, run nothing
 *   node scripts/build-included-apps.mjs --only <app-id> build only that product
 *   node scripts/build-included-apps.mjs --all           explicit full product release
 *   node scripts/build-included-apps.mjs --manifest <path-to-desktop-manifest.json>
 */
import { constants, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { listAppManifests } from '../../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_STUDIO = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(LOCAL_STUDIO, '../..');
export const DEFAULT_MANIFEST = path.join(
  REPO_ROOT,
  'packages/agentsam-desktop-shell/manifests/local-studio.json',
);
const STAGE = /^[a-z0-9][a-z0-9-]*$/;
// App-owned standalone public pages can be mounted outside an authenticated app's
// asset namespace without creating a second copy of the source experience.
const PUBLIC_MOUNT = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const RESERVED_PUBLIC_PREFIXES = new Set(['api', 'admin', 'auth', 'settings']);


function within(base, rel, label) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) {
    throw new Error(`${label} must be a relative path`);
  }
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error(`${label} "${rel}" escapes its directory`);
  }
  return abs;
}

function argv(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((x) => typeof x !== 'string' || !x)) {
    throw new Error(`${label} must be a non-empty array of strings`);
  }
  return value;
}

/** Resolve included_apps into concrete build plans. Throws on anything ambiguous. */
export function planIncludedApps({
  repoRoot = REPO_ROOT,
  manifestPath = DEFAULT_MANIFEST,
  localStudio = path.join(repoRoot, 'apps/local-studio'),
} = {}) {
  if (!existsSync(manifestPath)) return { skipped: `no desktop manifest at ${manifestPath}`, plans: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const ids = Array.isArray(manifest.included_apps) ? manifest.included_apps : [];
  const byId = new Map(listAppManifests(repoRoot).map((app) => [app.id, app]));
  const modules = Array.isArray(manifest.included_modules) ? manifest.included_modules : [];
  const plans = [];
  const hostApps = [];
  const stages = new Map();
  const items = ids.map((id) => {
    const app = byId.get(id);
    if (!app) {
      throw new Error(
        `included_apps entry "${id}" matches no agentsam.app.json (known: ${[...byId.keys()].join(', ') || 'none'})`,
      );
    }
    return { ...app, type: 'app' };
  });
  // Build-time modules may be staged alongside apps, but never count as a
  // separate account installation, product identity or launcher entry.
  for (const ref of modules) {
    if (!ref || typeof ref.id !== 'string' || typeof ref.manifest !== 'string') {
      throw new Error('included_modules entries require id and manifest');
    }
    const file = within(repoRoot, ref.manifest, 'included_modules.manifest');
    if (!existsSync(file)) throw new Error(`included module manifest missing: ${ref.manifest}`);
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (value.schema !== 'agentsam.package.v1' || value.kind !== 'module' || value.id !== ref.id) {
      throw new Error(`invalid included module identity: ${ref.manifest}`);
    }
    if (!ids.includes(value.owner_app_id) || ref.owner_app_id !== value.owner_app_id) {
      throw new Error(`included module has no installed owner APP: ${ref.id}`);
    }
    if (items.some((a) => a.id === ref.id)) throw new Error(`duplicate included module/app id: ${ref.id}`);
    items.push({ id: value.id, dir: path.dirname(file), manifest: value, type: 'module' });
  }
  for (const app of items) {
    const id = app.id;
    const embed = app.manifest.embed;
    if (!embed || !embed.build) {
      const screens = Array.isArray(app.manifest.screens) ? app.manifest.screens : [];
      const hostComponentOnly = app.type === 'app' && screens.length > 0 &&
        screens.every((screen) => screen?.mount?.type === 'host-component');
      if (hostComponentOnly) {
        hostApps.push({ id, kind: app.type, screens: screens.map((screen) => screen.id) });
        continue;
      }
      throw new Error(`app "${id}" is in included_apps but its agentsam.app.json declares no embed.build or host-component screen`);
    }
    if (!STAGE.test(embed.stage ?? '')) throw new Error(`app "${id}": embed.stage must match ${STAGE}`);
    if (stages.has(embed.stage)) {
      throw new Error(`apps "${stages.get(embed.stage)}" and "${id}" both declare embed.stage "${embed.stage}"`);
    }
    stages.set(embed.stage, id);
    const b = embed.build;
    const cwd = within(app.dir, b.cwd ?? '.', `app "${id}" embed.build.cwd`);
    const base = `/${embed.stage}/`;
    plans.push({
      id,
      kind: app.type,
      owner_app_id: app.type === 'module' ? app.manifest.owner_app_id : id,
      stage: embed.stage,
      base,
      cwd,
      install: b.install
        ? {
            lockfile: within(cwd, b.install.lockfile ?? 'package-lock.json', `app "${id}" embed.build.install.lockfile`),
            check: (b.install.check ?? []).map((f) => within(cwd, f, `app "${id}" embed.build.install.check`)),
            command: argv(b.install.command, `app "${id}" embed.build.install.command`),
          }
        : null,
      command: argv(b.command, `app "${id}" embed.build.command`).map((a) => a.replaceAll('{base}', base)),
      output: within(cwd, b.output, `app "${id}" embed.build.output`),
      index: b.index ? within(within(cwd, b.output, `app "${id}" embed.build.output`), b.index, `app "${id}" embed.build.index`) : null,
      scopeAssetUrls: b.scope_asset_urls === true,
      gzipOversizedWasm: b.gzip_oversized_wasm === true,
      publicDir: path.join(localStudio, 'frontend/public', embed.stage),
      stagedDir: path.join(localStudio, '.output/public', embed.stage),
      publicMounts: (embed.public_mounts ?? []).map((mount) => {
        if (!mount || typeof mount !== 'object' || typeof mount.from !== 'string' || typeof mount.to !== 'string' ||
            !PUBLIC_MOUNT.test(mount.from) || !PUBLIC_MOUNT.test(mount.to) ||
            RESERVED_PUBLIC_PREFIXES.has(mount.to.split('/')[0])) {
          throw new Error(`app "${id}" has invalid embed.public_mounts entry`);
        }
        return {
          from: within(path.join(localStudio, 'frontend/public', embed.stage), mount.from, `app "${id}" public mount source`),
          to: path.join(localStudio, '.output/public', mount.to),
          url: `/${mount.to}/`,
        };
      }),
    });
  }
  const publicMounts = new Set();
  for (const plan of plans) for (const mount of plan.publicMounts ?? []) {
    if ([...publicMounts].some((existing) => existing.startsWith(mount.url) || mount.url.startsWith(existing))) {
      throw new Error(`public mount "${mount.url}" overlaps another app's mount`);
    }
    if (stages.has(mount.url.split('/')[1])) throw new Error(`public mount "${mount.url}" overlaps an app's stage`);
    publicMounts.add(mount.url);
  }
  return { skipped: null, plans, hostApps };
}

function childEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
  }
  return env;
}

function run(command, cwd) {
  execFileSync(command[0], command.slice(1), { cwd, stdio: 'inherit', env: childEnv() });
}

function build(plan) {
  if (plan.install) {
    if (plan.install.check.length > 0 && plan.install.check.every((f) => existsSync(f))) {
      console.log(`[included-apps] ${plan.id}: dependencies present — skipping install`);
    } else {
      if (!existsSync(plan.install.lockfile)) throw new Error(`missing ${plan.install.lockfile}`);
      console.log(`[included-apps] ${plan.id}: installing (${plan.install.command.join(' ')})`);
      run(plan.install.command, plan.cwd);
    }
  }
  console.log(`[included-apps] ${plan.id}: building (${plan.command.join(' ')})`);
  run(plan.command, plan.cwd);
  if (!existsSync(plan.output)) throw new Error(`build produced no output at ${plan.output}`);
  rmSync(plan.publicDir, { recursive: true, force: true });
  mkdirSync(plan.publicDir, { recursive: true });
  cpSync(plan.output, plan.publicDir, { recursive: true, mode: constants.COPYFILE_FICLONE });
  if (plan.index) {
    if (!existsSync(plan.index)) throw new Error(`app "${plan.id}" declared missing built index ${plan.index}`);
    let html = readFileSync(plan.index, 'utf8');
    if (plan.scopeAssetUrls) {
      // Scope static resources for an embedded SPA without rewriting its API endpoints.
      html = html.replace(/(\b(?:href|src)=["'])\/(?!\/)/g, `$1${plan.base}`);
    }
    writeFileSync(path.join(plan.publicDir, 'index.html'), html);
  }
}

function stage(plan) {
  if (!existsSync(plan.publicDir)) {
    throw new Error(`${plan.publicDir} is missing — run without --stage first`);
  }
  // A stage is an owned app release, not an overlay; removed assets must not survive.
  rmSync(plan.stagedDir, { recursive: true, force: true });
  mkdirSync(path.dirname(plan.stagedDir), { recursive: true });
  cpSync(plan.publicDir, plan.stagedDir, { recursive: true, mode: constants.COPYFILE_FICLONE });
  for (const mount of plan.publicMounts ?? []) {
    if (!existsSync(mount.from) || !statSync(mount.from).isDirectory()) {
      throw new Error(`${plan.id} public experience missing: ${mount.from}`);
    }
    rmSync(mount.to, { recursive: true, force: true });
    mkdirSync(path.dirname(mount.to), { recursive: true });
    cpSync(mount.from, mount.to, { recursive: true, mode: constants.COPYFILE_FICLONE });
    console.log(`[included-apps] ${plan.id}: public experience -> ${mount.url}`);
  }
  if (plan.gzipOversizedWasm) {
    const assetDir = path.join(plan.stagedDir, 'assets');
    if (!existsSync(assetDir)) throw new Error(`${plan.id} requested WASM compression without an assets folder`);
    let compressedCount = 0;
    for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.wasm')) continue;
      const asset = path.join(assetDir, entry.name);
      if (statSync(asset).size <= 25 * 1024 * 1024) continue;
      const packed = gzipSync(readFileSync(asset), { level: 9 });
      if (packed.length > 25 * 1024 * 1024) throw new Error(`${plan.id} compressed WASM exceeds Cloudflare asset limit: ${entry.name}`);
      writeFileSync(`${asset}.gz`, packed);
      rmSync(asset);
      compressedCount += 1;
      console.log(`[included-apps] ${plan.id}: compressed ${entry.name} for Worker asset delivery`);
    }
    if (compressedCount === 0) console.log(`[included-apps] ${plan.id}: no oversized WASM assets to compress`);
  }
}

function main() {
  const { values: flags } = parseArgs({
    args: process.argv.slice(2),
    options: {
      stage: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      manifest: { type: 'string' },
      only: { type: 'string' },
      all: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  let result;
  try {
    result = planIncludedApps({ manifestPath: flags.manifest ? path.resolve(flags.manifest) : DEFAULT_MANIFEST });
  } catch (err) {
    console.error(`[included-apps] ERROR: ${err.message}`);
    process.exit(1);
  }
  if (result.skipped) {
    console.log(`[included-apps] ${result.skipped} — skipping`);
    return;
  }
  if (result.plans.length === 0) {
    for (const app of result.hostApps ?? []) {
      console.log(`[included-apps] ${app.id}: host-component screen bundled with Local Studio — no separate asset build`);
    }
    console.log(result.hostApps?.length
      ? '[included-apps] host-bundled apps only — no separate embed assets to build'
      : '[included-apps] none declared — host Local Studio only');
    return;
  }
  if (flags.only && !result.plans.some((plan) => plan.id === flags.only)) {
    if (result.hostApps?.some((app) => app.id === flags.only)) return;
    console.error(`[included-apps] ERROR: included app "${flags.only}" is not registered for a separate embed build`);
    process.exit(1);
  }
  if (flags.only && flags.all) {
    console.error('[included-apps] ERROR: --only and --all are mutually exclusive');
    process.exit(1);
  }
  // Packaging existing staged assets never rebuilds them. Any *build* must
  // identify an owner or explicitly opt into a full release.
  if (!flags.stage && !flags['dry-run'] && !flags.only && !flags.all) {
    console.error('[included-apps] Refusing to rebuild every installed app. Pass --only <app-id> or --all for an explicitly approved full release.');
    process.exit(1);
  }
  // Scoped product releases include their declared modules, not unrelated
  // applications. A module can still be rebuilt directly with --only <module>.
  const selected = flags.only
    ? result.plans.filter(plan => plan.id === flags.only || plan.kind === 'module' && plan.owner_app_id === flags.only)
    : result.plans;
  if (flags['dry-run']) {
    console.log(JSON.stringify(selected, null, 2));
    return;
  }
  for (const app of result.hostApps ?? []) {
    console.log(`[included-apps] ${app.id}: host-component screen bundled with Local Studio — no separate asset build`);
  }
  for (const plan of selected) {
    try {
      if (flags.stage) stage(plan);
      else build(plan);
      console.log(`[included-apps] ${plan.id}: ${flags.stage ? 'staged' : 'built'} -> /${plan.stage}/`);
    } catch (err) {
      console.error(`[included-apps] ERROR (${plan.id}): ${err.message}`);
      process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
