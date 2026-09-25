import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSkillManifest } from './manifest.js';
import { canonicalizeSlashTrigger } from './slash.js';
import {
  readLocalRegistry,
  loadInstalledManifest,
  skillsHome,
} from './local-store.js';
import { listSkills as listBuiltinCatalog } from './catalog.js';

/**
 * SkillRegistry — resolve from layered sources without fake accounts.
 *
 * Layers (later does not override earlier trigger unless aliased explicitly):
 *   1. user / installed local registry (authoritative triggers)
 *   2. app-provided (optional)
 *   3. SDK builtins (suggested triggers only if free)
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   icon: string,
 *   trigger: string|null,
 *   source: 'user'|'package'|'builtin'|'app',
 *   manifest: import('./manifest.js').SkillManifest,
 *   baseDir?: string,
 *   version?: string|null,
 *   package?: string|null,
 * }} ResolvedSkill
 */

function builtinSuggestedTrigger(skill) {
  const id = String(skill.id || '')
    .replace(/^agentsam-/, '')
    .replace(/_/g, '-');
  try {
    return canonicalizeSlashTrigger(`/${id}`);
  } catch {
    return null;
  }
}

function builtinToManifest(skill, skillsRoot) {
  return normalizeSkillManifest({
    schema: 'agentsam.skill.v1',
    id: skill.id,
    name: skill.title || skill.id,
    description: skill.description || '',
    icon: 'skill',
    slash: { suggested: builtinSuggestedTrigger(skill) || undefined },
    instructions: {
      source: 'package_file',
      ref: skill.entry,
    },
    execution: {
      mode: 'turn',
      tools: [],
      operations: [],
      capabilities: [],
    },
    package: '@inneranimalmedia/agentsam-sdk',
  });
}

export class SkillRegistry {
  /**
   * @param {{
 *     home?: string,
 *     builtins?: boolean,
 *     appSkills?: ResolvedSkill[],
 *     skillsRoot?: string,
 *   }} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.includeBuiltins = options.builtins !== false;
    this.appSkills = Array.isArray(options.appSkills) ? options.appSkills : [];
    this.skillsRoot =
      options.skillsRoot ||
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');
  }

  /** @returns {ResolvedSkill[]} */
  list() {
    /** @type {Map<string, ResolvedSkill>} */
    const byId = new Map();

    if (this.includeBuiltins) {
      for (const row of listBuiltinCatalog()) {
        const manifest = builtinToManifest(row, this.skillsRoot);
        byId.set(manifest.id, {
          id: manifest.id,
          name: manifest.name,
          description: manifest.description || '',
          icon: manifest.icon || 'skill',
          trigger: null, // assigned only when free / aliased
          source: 'builtin',
          manifest,
          baseDir: this.skillsRoot,
          package: manifest.package || null,
          version: null,
        });
      }
    }

    for (const app of this.appSkills) {
      byId.set(app.id, { ...app, source: 'app' });
    }

    const local = readLocalRegistry(this.options);
    for (const entry of Object.values(local.entries)) {
      try {
        const manifest = loadInstalledManifest(entry);
        byId.set(entry.id, {
          id: entry.id,
          name: manifest.name,
          description: manifest.description || '',
          icon: manifest.icon || 'skill',
          trigger: entry.trigger,
          source: entry.source === 'user' ? 'user' : 'package',
          manifest,
          baseDir: entry.baseDir,
          package: entry.package || null,
          version: entry.version || null,
        });
      } catch {
        /* skip corrupt */
      }
    }

    // Assign builtin suggested triggers only when not claimed
    const claimed = new Set(
      Object.keys(local.triggers || {}).concat(
        [...byId.values()].map((s) => s.trigger).filter(Boolean),
      ),
    );
    for (const skill of byId.values()) {
      if (skill.trigger) continue;
      if (skill.source !== 'builtin') continue;
      const suggested = skill.manifest.slash?.suggested;
      if (suggested && !claimed.has(suggested)) {
        skill.trigger = suggested;
        claimed.add(suggested);
      }
    }

    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** @returns {Map<string, ResolvedSkill>} */
  triggerMap() {
    const map = new Map();
    for (const skill of this.list()) {
      if (skill.trigger) map.set(skill.trigger, skill);
    }
    return map;
  }

  getById(id) {
    const needle = String(id || '').trim().toLowerCase();
    return this.list().find((s) => s.id === needle) || null;
  }

  getByTrigger(triggerRaw) {
    let trigger;
    try {
      trigger = canonicalizeSlashTrigger(triggerRaw);
    } catch {
      return null;
    }
    return this.triggerMap().get(trigger) || null;
  }

  vocabulary() {
    return [...this.triggerMap().keys()].sort();
  }
}

export { skillsHome };
