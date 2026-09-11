import fs from 'node:fs';
import path from 'node:path';
import {
  blenderBuild,
  blenderExport,
  blenderInspect,
  blenderRenderPreview,
  blenderStatus,
} from '../lib/cad/index.js';

function usage() {
  return `AgentSam programmatic CAD

Usage:
  agentsam cad blender status [--blender-bin <path>] [--json]
  agentsam cad blender inspect <model.blend> [--timeout <seconds>] [--json]
  agentsam cad blender build <recipe.json> --out <model.blend> [--input <base.blend>] [--json]
  agentsam cad blender render-preview <model.blend> --out <preview.png> [--camera <name>] [--scene <name>] [--width 1024] [--height 1024] [--json]
  agentsam cad blender export <model.blend> --format <glb|stl|obj> --out <artifact> [--objects <a,b>] [--collection <name>] [--json]

Shared options:
  --blender-bin <path>  Explicit Blender executable. Otherwise AGENTSAM_BLENDER_BIN, PATH, then common install locations are checked.
  --timeout <seconds>   Bounded execution time, 1..600 (default 120).
  --cwd <path>          Resolve input/output paths from another directory.
  --json                Machine-readable output.

The build command consumes a typed recipe; it never evaluates arbitrary Python.`;
}

function parseArgs(argv) {
  const opts = { positional: [], json: false, applyModifiers: true };
  const values = new Set([
    '--blender-bin', '--timeout', '--cwd', '--out', '--input', '--camera', '--scene',
    '--width', '--height', '--engine', '--format', '--objects', '--collection',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--no-apply-modifiers') opts.applyModifiers = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (values.has(arg)) {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      opts[key] = value;
    } else if (arg.startsWith('-')) throw new Error(`unknown cad option: ${arg}`);
    else opts.positional.push(arg);
  }
  return opts;
}

function output(value, json) {
  if (json) {
    console.log(JSON.stringify(value));
    return;
  }
  if (value.capability === 'blender.status') {
    console.log(value.available
      ? `Blender available: ${value.version || 'unknown version'}\n${value.binary}`
      : `Blender unavailable${value.error ? `: ${value.error}` : ''}`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export async function runCad(argv) {
  const engine = argv[0];
  if (!engine || engine === '--help' || engine === '-h') {
    console.log(usage());
    return;
  }
  if (engine !== 'blender') throw new Error(`unsupported CAD engine: ${engine}. Expected blender.`);

  const action = argv[1];
  const opts = parseArgs(argv.slice(2));
  if (!action || opts.help) {
    console.log(usage());
    return;
  }

  const cwd = path.resolve(opts.cwd || process.cwd());
  const shared = {
    blenderBin: opts.blenderBin,
    timeoutSeconds: opts.timeout == null ? undefined : Number(opts.timeout),
    cwd,
  };

  let result;
  if (action === 'status') {
    result = await blenderStatus(shared);
  } else if (action === 'inspect') {
    result = await blenderInspect({ ...shared, input: required(opts.positional[0], 'inspect requires <model.blend>') });
  } else if (action === 'build') {
    const recipeFile = path.resolve(cwd, required(opts.positional[0], 'build requires <recipe.json>'));
    if (!fs.existsSync(recipeFile)) throw new Error(`recipe file not found: ${recipeFile}`);
    let recipe;
    try { recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8')); }
    catch (error) { throw new Error(`invalid recipe JSON: ${error.message}`); }
    result = await blenderBuild({
      ...shared,
      input: opts.input,
      output: required(opts.out, 'build requires --out <model.blend>'),
      recipe,
    });
  } else if (action === 'render-preview') {
    result = await blenderRenderPreview({
      ...shared,
      input: required(opts.positional[0], 'render-preview requires <model.blend>'),
      output: required(opts.out, 'render-preview requires --out <preview.png>'),
      scene: opts.scene,
      camera: opts.camera,
      width: opts.width == null ? undefined : Number(opts.width),
      height: opts.height == null ? undefined : Number(opts.height),
      engine: opts.engine,
    });
  } else if (action === 'export') {
    result = await blenderExport({
      ...shared,
      input: required(opts.positional[0], 'export requires <model.blend>'),
      output: required(opts.out, 'export requires --out <artifact>'),
      format: required(opts.format, 'export requires --format <glb|stl|obj>'),
      scene: opts.scene,
      objects: opts.objects,
      collection: opts.collection,
      applyModifiers: opts.applyModifiers,
    });
  } else {
    throw new Error(`unknown Blender CAD action: ${action}`);
  }

  output(result, opts.json);
  return result;
}
