#!/usr/bin/env node
/**
 * Build and stage every app named in the desktop brand manifest's `included_apps`.
 *
 * Nothing in this file is app-specific. An app declares how it is built and where
 * it is served from in its own agentsam.app.json:
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
 * To ship another app with Local Studio: add its id to `included_apps` in
 * packages/agentsam-desktop-shell/manifests/local-studio.json and give it an `embed` block.
 * No edit to this file.
 *
 * Usage (from apps/local-studio):
 *   node scripts/build-included-apps.mjs                 refuse implicit all-product rebuild
 *   node scripts/build-included-apps.mjs --stage         copy frontend/public/<stage> into .output/public/<stage>
 *   node scripts/build-included-apps.mjs --dry-run       print the resolved plan, run nothing
 *   node scripts/build-included-apps.mjs --only <app-id> build only that product
 *   node scripts/build-included-apps.mjs --all           explicit full product release
 *   node scripts/build-included-apps.mjs --manifest <path-to-desktop-manifest.json>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { listAppManifests } from '../../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_STUDIO = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(LOCAL_STUDIO, '../..');
export const DEFAULT_MANIFEST = path.join(
  REPO_ROOT,
  'packages/agentsam-desktop-shell/manifests/local-studio.json',
);
const STAGE = /^[a-z0-9][a-z0-9-]*$/;

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
  const plans = [];
  const stages = new Map();
  for (const id of ids) {
    const app = byId.get(id);
    if (!app) {
      throw new Error(
        `included_apps entry "${id}" matches no agentsam.app.json (known: ${[...byId.keys()].join(', ') || 'none'})`,
      );
    }
    const embed = app.manifest.embed;
    if (!embed || !embed.build) {
      throw new Error(`app "${id}" is in included_apps but its agentsam.app.json declares no embed.build`);
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
      publicDir: path.join(localStudio, 'frontend/public', embed.stage),
      stagedDir: path.join(localStudio, '.output/public', embed.stage),
    });
  }
  return { skipped: null, plans };
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
  cpSync(plan.output, plan.publicDir, { recursive: true });
}

function stage(plan) {
  if (!existsSync(plan.publicDir)) {
    throw new Error(`${plan.publicDir} is missing — run without --stage first`);
  }
  mkdirSync(path.dirname(plan.stagedDir), { recursive: true });
  cpSync(plan.publicDir, plan.stagedDir, { recursive: true });
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
    console.log('[included-apps] none declared — host Local Studio only');
    return;
  }
  if (flags.only && !result.plans.some((plan) => plan.id === flags.only)) {
    console.error(`[included-apps] ERROR: included app "${flags.only}" is not registered`);
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
  const selected = flags.only ? result.plans.filter((plan) => plan.id === flags.only) : result.plans;
  if (flags['dry-run']) {
    console.log(JSON.stringify(selected, null, 2));
    return;
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
