import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  SkillRegistry,
  SkillRuntime,
  SkillContentResolver,
  createUserSkill,
  installSkillFromPath,
  aliasSkill,
  removeSkill,
  readLocalRegistry,
} from '../skills/index.js';

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function help() {
  return [
    'AgentSam · skill',
    '  agentsam skill list',
    '  agentsam skill create <id>',
    '  agentsam skill inspect <id>',
    '  agentsam skill edit <id>          (prints path to edit)',
    '  agentsam skill install <path|npm-package> [--alias /trigger]',
    '  agentsam skill alias <id> </trigger>',
    '  agentsam skill remove <id>',
    '  agentsam skill publish <id>       (prints package checklist; no network)',
    '  agentsam skill invoke </trigger> [args...]',
    '',
    'Slash triggers are local. Package manifests only suggest a trigger.',
    'Collisions require an explicit alias — nothing is globally reserved.',
    '',
  ].join('\n');
}

function looksLikeNpmPackage(source) {
  const s = String(source || '').trim();
  if (!s) return false;
  if (s.startsWith('.') || s.startsWith('/') || s.includes('\\')) return false;
  if (s.startsWith('@')) return true;
  // bare package name (no path separators)
  return !s.includes('/') && !s.endsWith('.json');
}

/**
 * Download an npm package tarball and return the extracted package root
 * that contains agentsam.skill.json (or package root for relative resolve).
 */

function buildNpmPackEnv(baseEnv = process.env) {
  const env = { ...baseEnv };

  // resolveNpmSkillPackage requires a physical tarball.
  // Parent npm lifecycle flags such as `npm publish --dry-run`
  // must not change the semantics of this nested npm invocation.
  for (const key of Object.keys(env)) {
    if (/^npm_config_dry[_-]?run$/i.test(key)) {
      delete env[key];
    }
  }

  return env;
}

export function resolveNpmSkillPackage(spec, options = {}) {
  const spawn = options.spawnSyncImpl || spawnSync;
  const maxPackAttempts = 2;

  let tmp = null;
  let tgzPath = null;
  let lastExpectedPath = null;

  for (let attempt = 1; attempt <= maxPackAttempts; attempt += 1) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-skill-npm-'));

    const pack = spawn('npm', ['pack', spec, '--json', '--pack-destination', tmp], {
      encoding: 'utf8',
      cwd: options.cwd || process.cwd(),
      env: buildNpmPackEnv(options.env || process.env),
    });

    if ((pack.status ?? 1) !== 0) {
      throw new Error(
        `npm_pack_failed:${spec}:${String(pack.stderr || pack.stdout || '').trim() || 'unknown'}`,
      );
    }

    let tgzName = null;

    try {
      const payload = JSON.parse(String(pack.stdout || ''));
      const entry = Array.isArray(payload) ? payload[0] : payload;
      if (entry?.filename) tgzName = path.basename(String(entry.filename));
    } catch {
      // Fall through to filesystem discovery.
    }

    const packed = fs.readdirSync(tmp)
      .filter((name) => name.endsWith('.tgz'))
      .sort();

    if (!tgzName && packed.length === 1) {
      tgzName = packed[0];
    }

    if (tgzName) {
      const expected = path.join(tmp, tgzName);
      lastExpectedPath = expected;

      if (fs.existsSync(expected)) {
        tgzPath = expected;
        break;
      }
    }

    // npm occasionally reports success before producing no artifact.
    // Treat only that narrow condition as transient and retry once.
    if (attempt < maxPackAttempts) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = null;
    }
  }

  if (!tmp || !tgzPath || !fs.existsSync(tgzPath)) {
    throw new Error(
      `npm_pack_missing:${lastExpectedPath || spec}:attempts=${maxPackAttempts}`,
    );
  }

  const extractDir = path.join(tmp, 'pkg');
  fs.mkdirSync(extractDir, { recursive: true });
  const tar = spawn('tar', ['-xzf', tgzPath, '-C', extractDir], { encoding: 'utf8' });
  if ((tar.status ?? 1) !== 0) {
    throw new Error(`npm_extract_failed:${String(tar.stderr || '').trim() || 'tar failed'}`);
  }
  const packageRoot = path.join(extractDir, 'package');
  const candidates = [
    path.join(packageRoot, 'agentsam.skill.json'),
    path.join(packageRoot, 'skill', 'agentsam.skill.json'),
    path.join(packageRoot, 'skills', 'agentsam.skill.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return path.dirname(file);
  }
  // walk one level
  if (fs.existsSync(packageRoot)) {
    for (const name of fs.readdirSync(packageRoot)) {
      const nested = path.join(packageRoot, name, 'agentsam.skill.json');
      if (fs.existsSync(nested)) return path.dirname(nested);
    }
  }
  throw new Error(`agentsam.skill.json_not_found_in_package:${spec}`);
}

/**
 * @param {string[]} argv
 * @param {{ write?: Function, home?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export async function runSkill(argv = [], options = {}) {
  const write = options.write || ((t) => process.stdout.write(t));
  const [command = 'list', ...rest] = argv;

  if (command === '--help' || command === '-h' || command === 'help') {
    write(help());
    return null;
  }

  const registry = new SkillRegistry({ home: options.home, env: options.env });
  const runtime = new SkillRuntime({
    registry,
    contentResolver: new SkillContentResolver(),
  });

  if (command === 'list') {
    const rows = registry.list();
    writeLine(write, '');
    writeLine(write, '  AgentSam · skills');
    writeLine(write, '');
    for (const row of rows) {
      const trig = row.trigger ? row.trigger.padEnd(22) : '(no trigger)'.padEnd(22);
      writeLine(write, `  ${trig} ${row.id.padEnd(28)} [${row.source}]`);
      if (row.description) writeLine(write, `    ${row.description}`);
    }
    writeLine(write, '');
    return rows;
  }

  if (command === 'create') {
    const id = rest[0];
    if (!id) throw new Error('skill create requires <id>');
    const result = createUserSkill(id, { home: options.home, env: options.env });
    writeLine(write, '');
    writeLine(write, `  created ${result.manifest.id}`);
    writeLine(write, `  trigger  ${result.trigger}`);
    writeLine(write, `  path     ${result.root}`);
    writeLine(write, '');
    return result;
  }

  if (command === 'inspect') {
    const id = rest[0];
    if (!id) throw new Error('skill inspect requires <id>');
    const skill = registry.getById(id);
    if (!skill) throw new Error(`unknown_skill:${id}`);
    write(`${JSON.stringify(skill, null, 2)}\n`);
    return skill;
  }

  if (command === 'edit') {
    const id = rest[0];
    if (!id) throw new Error('skill edit requires <id>');
    const local = readLocalRegistry({ home: options.home, env: options.env });
    const entry = local.entries[id];
    if (!entry) throw new Error(`skill_not_user_editable:${id}`);
    writeLine(write, entry.manifestPath);
    writeLine(write, path.join(entry.baseDir, 'SKILL.md'));
    return entry;
  }

  if (command === 'install') {
    const source = rest[0];
    if (!source) throw new Error('skill install requires <path|npm-package>');
    let aliasOnCollision;
    for (let i = 1; i < rest.length; i += 1) {
      if (rest[i] === '--alias' || rest[i] === '--trigger') aliasOnCollision = rest[++i];
    }

    let installPath = source;
    if (looksLikeNpmPackage(source)) {
      writeLine(write, `  packing ${source}…`);
      installPath = resolveNpmSkillPackage(source, options);
    }

    try {
      const result = installSkillFromPath(installPath, {
        home: options.home,
        env: options.env,
        aliasOnCollision,
      });
      writeLine(write, '');
      writeLine(write, `  installed ${result.id}`);
      writeLine(write, `  trigger   ${result.trigger}`);
      writeLine(write, '');
      return result;
    } catch (error) {
      if (error?.code === 'SLASH_COLLISION') {
        writeLine(write, '');
        writeLine(write, `  Conflict: ${error.suggested} already owned by ${error.owner}`);
        writeLine(write, '  Choose an alias:');
        for (const c of error.candidates || []) {
          writeLine(write, `    agentsam skill install ${source} --alias ${c}`);
        }
        writeLine(write, '');
        throw error;
      }
      throw error;
    }
  }

  if (command === 'alias') {
    const id = rest[0];
    const trigger = rest[1];
    if (!id || !trigger) throw new Error('skill alias requires <id> </trigger>');
    const result = aliasSkill(id, trigger, { home: options.home, env: options.env });
    writeLine(write, `  ${result.id} → ${result.trigger}`);
    return result;
  }

  if (command === 'remove') {
    const id = rest[0];
    if (!id) throw new Error('skill remove requires <id>');
    const result = removeSkill(id, { home: options.home, env: options.env });
    writeLine(write, result.removed ? `  removed ${id}` : `  ${id} was not installed`);
    return result;
  }

  if (command === 'publish') {
    const id = rest[0];
    if (!id) throw new Error('skill publish requires <id>');
    const skill = registry.getById(id);
    if (!skill) throw new Error(`unknown_skill:${id}`);
    writeLine(write, '');
    writeLine(write, '  Publish checklist (no network from portable core):');
    writeLine(write, '  1. Ensure agentsam.skill.json validates as agentsam.skill.v1');
    writeLine(write, '  2. npm publish (suggested slash is not globally reserved)');
    writeLine(write, '  3. Consumers: agentsam skill install <path|@scope/pkg>');
    writeLine(write, `  skill  ${skill.id}`);
    writeLine(write, `  slash  ${skill.manifest.slash?.suggested || '(none)'}`);
    writeLine(write, '');
    return { id: skill.id, checklist: true };
  }

  if (command === 'invoke') {
    const input = rest.join(' ').trim();
    if (!input.startsWith('/')) throw new Error('skill invoke requires a /trigger');
    const result = await runtime.invoke({ input });
    write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  throw new Error(`unknown skill command: ${command}`);
}

export function skillCommandHelp() {
  return help();
}
