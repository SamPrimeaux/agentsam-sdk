import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalizeSlashTrigger } from './slash.js';
import { normalizeSkillManifest, createBlankSkillManifest } from './manifest.js';

/**
 * Local install registry under ~/.agentsam/skills/
 *
 * {
 *   schema: 'agentsam.skill-registry.v1',
 *   entries: {
 *     [skillId]: {
 *       id, trigger, source: 'user'|'package'|'builtin'|'app',
 *       manifestPath, installedAt, package?, version?
 *     }
 *   },
 *   triggers: { '/foo': 'skill-id' }
 * }
 */

function homeDir(options = {}) {
  return path.resolve(
    String(options.home || options.env?.HOME || options.env?.USERPROFILE || os.homedir()),
  );
}

export function skillsHome(options = {}) {
  return path.join(homeDir(options), '.agentsam', 'skills');
}

export function registryPath(options = {}) {
  return path.join(skillsHome(options), 'registry.json');
}

function emptyRegistry() {
  return {
    schema: 'agentsam.skill-registry.v1',
    entries: {},
    triggers: {},
  };
}

function atomicWrite(file, data, mode = 0o600) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, { mode });
  fs.renameSync(tmp, file);
  if (process.platform !== 'win32') fs.chmodSync(file, mode);
}

export function readLocalRegistry(options = {}) {
  const file = registryPath(options);
  if (!fs.existsSync(file)) return emptyRegistry();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      schema: 'agentsam.skill-registry.v1',
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      triggers: parsed.triggers && typeof parsed.triggers === 'object' ? parsed.triggers : {},
    };
  } catch {
    return emptyRegistry();
  }
}

export function writeLocalRegistry(registry, options = {}) {
  const file = registryPath(options);
  atomicWrite(file, `${JSON.stringify(registry, null, 2)}\n`, 0o600);
  return file;
}

/**
 * @param {string} skillId
 * @param {{ trigger?: string, home?: string }} [options]
 */
export function createUserSkill(skillId, options = {}) {
  const manifest = createBlankSkillManifest(skillId);
  const trigger = options.trigger
    ? canonicalizeSlashTrigger(options.trigger)
    : manifest.slash?.suggested || `/${manifest.id}`;

  const root = path.join(skillsHome(options), 'user', manifest.id);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const skillMd = path.join(root, 'SKILL.md');
  fs.writeFileSync(skillMd, manifest.instructions.inline || '', { mode: 0o600 });

  const onDisk = {
    ...manifest,
    instructions: { source: 'local_file', ref: 'SKILL.md' },
  };
  const manifestFile = path.join(root, 'agentsam.skill.json');
  atomicWrite(manifestFile, `${JSON.stringify(onDisk, null, 2)}\n`);

  const registry = readLocalRegistry(options);
  if (registry.entries[manifest.id]) throw new Error(`skill_exists:${manifest.id}`);
  if (registry.triggers[trigger]) {
    throw new Error(`slash_collision:${trigger}->${registry.triggers[trigger]}`);
  }

  registry.entries[manifest.id] = {
    id: manifest.id,
    trigger,
    source: 'user',
    manifestPath: manifestFile,
    baseDir: root,
    installedAt: new Date().toISOString(),
  };
  registry.triggers[trigger] = manifest.id;
  writeLocalRegistry(registry, options);
  return { manifest: onDisk, trigger, root, manifestPath: manifestFile };
}

/**
 * Find skill manifests in a skill directory or a package containing a `skill/`
 * or `skills/` collection. Only the collection's direct child directories are
 * inspected; arbitrary recursive package traversal is intentionally avoided.
 * @param {string} sourcePath
 * @returns {string[]} absolute agentsam.skill.json paths
 */
export function findSkillManifestFiles(sourcePath) {
  const abs = path.resolve(sourcePath);
  const directFile = abs.endsWith('agentsam.skill.json') ? abs : path.join(abs, 'agentsam.skill.json');
  if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) return [directFile];

  const roots = [abs, path.join(abs, 'skill'), path.join(abs, 'skills')];
  const direct = roots
    .map((root) => path.join(root, 'agentsam.skill.json'))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  if (direct.length) return [...new Set(direct)].sort();

  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(root, entry.name, 'agentsam.skill.json');
      if (fs.existsSync(file) && fs.statSync(file).isFile()) found.push(file);
    }
  }
  return [...new Set(found)].sort();
}

/**
 * Install one skill or every skill declared by a multi-skill npm package.
 * Multi-skill packages are preflighted for duplicate IDs and slash collisions
 * before any local registry entries are written.
 * @param {string} sourcePath
 * @param {{ trigger?: string, aliasOnCollision?: string, home?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function installSkillsFromPath(sourcePath, options = {}) {
  const manifestFiles = findSkillManifestFiles(sourcePath);
  if (!manifestFiles.length) throw new Error('agentsam.skill.json_required');
  if (manifestFiles.length === 1) {
    return installSkillFromPath(path.dirname(manifestFiles[0]), options);
  }
  if (options.aliasOnCollision || options.trigger) {
    throw new Error('skill_package_alias_requires_single_skill');
  }

  const prepared = manifestFiles.map((manifestFile) => {
    const manifest = normalizeSkillManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
    return {
      manifest,
      baseDir: path.dirname(manifestFile),
      trigger: canonicalizeSlashTrigger(manifest.slash?.suggested || `/${manifest.id}`),
    };
  });

  const ids = new Set();
  for (const item of prepared) {
    if (ids.has(item.manifest.id)) throw new Error(`duplicate_skill_id:${item.manifest.id}`);
    ids.add(item.manifest.id);
  }

  const registry = readLocalRegistry(options);
  const triggerOwners = { ...registry.triggers };
  for (const [trigger, owner] of Object.entries(triggerOwners)) {
    if (ids.has(owner)) delete triggerOwners[trigger];
  }
  for (const item of prepared) {
    const owner = triggerOwners[item.trigger];
    if (owner && owner !== item.manifest.id) {
      const err = new Error(`slash_collision:${item.trigger}`);
      err.code = 'SLASH_COLLISION';
      err.suggested = item.trigger;
      err.owner = owner;
      err.candidates = [`${item.trigger}-${item.manifest.id}`.slice(0, 64), `/${item.manifest.id}`];
      err.packageSkillCount = prepared.length;
      throw err;
    }
    triggerOwners[item.trigger] = item.manifest.id;
  }

  return prepared.map((item) => installSkillFromPath(item.baseDir, options));
}

/**
 * Install from a directory containing agentsam.skill.json (or package root).
 * @param {string} sourcePath
 * @param {{ trigger?: string, aliasOnCollision?: string, home?: string }} [options]
 */
export function installSkillFromPath(sourcePath, options = {}) {
  const abs = path.resolve(sourcePath);
  const manifestFile = fs.existsSync(path.join(abs, 'agentsam.skill.json'))
    ? path.join(abs, 'agentsam.skill.json')
    : abs.endsWith('agentsam.skill.json')
      ? abs
      : null;
  if (!manifestFile || !fs.existsSync(manifestFile)) {
    throw new Error('agentsam.skill.json_required');
  }
  const baseDir = path.dirname(manifestFile);
  const manifest = normalizeSkillManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
  const suggested = manifest.slash?.suggested || `/${manifest.id}`;
  let trigger = options.trigger
    ? canonicalizeSlashTrigger(options.trigger)
    : suggested;

  const registry = readLocalRegistry(options);
  const existingOwner = registry.triggers[trigger];
  if (existingOwner && existingOwner !== manifest.id) {
    if (!options.aliasOnCollision) {
      const err = new Error(`slash_collision:${trigger}`);
      err.code = 'SLASH_COLLISION';
      err.suggested = suggested;
      err.owner = existingOwner;
      err.candidates = [`${trigger}-${manifest.id}`.slice(0, 64), `/${manifest.id}`];
      throw err;
    }
    trigger = canonicalizeSlashTrigger(options.aliasOnCollision);
    if (registry.triggers[trigger] && registry.triggers[trigger] !== manifest.id) {
      throw new Error(`slash_collision:${trigger}`);
    }
  }

  // Copy into install root for stability
  const installRoot = path.join(skillsHome(options), 'installed', manifest.id);
  fs.mkdirSync(installRoot, { recursive: true, mode: 0o700 });
  const destManifest = path.join(installRoot, 'agentsam.skill.json');
  atomicWrite(destManifest, `${JSON.stringify(manifest, null, 2)}\n`);

  // Copy instruction file if package_file / local_file relative
  if (
    (manifest.instructions.source === 'local_file' ||
      manifest.instructions.source === 'package_file') &&
    manifest.instructions.ref
  ) {
    const src = path.resolve(baseDir, manifest.instructions.ref);
    if (fs.existsSync(src)) {
      const dest = path.join(installRoot, path.basename(src));
      fs.copyFileSync(src, dest);
      manifest.instructions = {
        source: 'local_file',
        ref: path.basename(src),
      };
      atomicWrite(destManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  // Clear old trigger for this id if reinstalling
  for (const [t, id] of Object.entries(registry.triggers)) {
    if (id === manifest.id) delete registry.triggers[t];
  }

  registry.entries[manifest.id] = {
    id: manifest.id,
    trigger,
    source: 'package',
    manifestPath: destManifest,
    baseDir: installRoot,
    package: manifest.package || null,
    version: manifest.version || null,
    installedAt: new Date().toISOString(),
  };
  registry.triggers[trigger] = manifest.id;
  writeLocalRegistry(registry, options);
  return { id: manifest.id, trigger, manifestPath: destManifest };
}

export function aliasSkill(skillId, triggerRaw, options = {}) {
  const registry = readLocalRegistry(options);
  const entry = registry.entries[skillId];
  if (!entry) throw new Error(`unknown_skill:${skillId}`);
  const trigger = canonicalizeSlashTrigger(triggerRaw);
  const owner = registry.triggers[trigger];
  if (owner && owner !== skillId) throw new Error(`slash_collision:${trigger}->${owner}`);
  for (const [t, id] of Object.entries(registry.triggers)) {
    if (id === skillId) delete registry.triggers[t];
  }
  registry.triggers[trigger] = skillId;
  entry.trigger = trigger;
  writeLocalRegistry(registry, options);
  return { id: skillId, trigger };
}

export function removeSkill(skillId, options = {}) {
  const registry = readLocalRegistry(options);
  if (!registry.entries[skillId]) return { removed: false };
  delete registry.entries[skillId];
  for (const [t, id] of Object.entries(registry.triggers)) {
    if (id === skillId) delete registry.triggers[t];
  }
  writeLocalRegistry(registry, options);
  return { removed: true, id: skillId };
}

export function loadInstalledManifest(entry) {
  const raw = JSON.parse(fs.readFileSync(entry.manifestPath, 'utf8'));
  return normalizeSkillManifest(raw);
}
