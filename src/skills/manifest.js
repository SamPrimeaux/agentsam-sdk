import { canonicalizeSlashTrigger } from './slash.js';

/**
 * @typedef {{
 *   schema: 'agentsam.skill.v1',
 *   id: string,
 *   name: string,
 *   description?: string,
 *   icon?: string,
 *   version?: string,
 *   package?: string,
 *   slash?: { suggested?: string },
 *   instructions: {
 *     source: 'inline'|'local_file'|'package_file'|'database'|'object_store',
 *     ref?: string,
 *     inline?: string,
 *   },
 *   execution?: {
 *     mode?: 'turn',
 *     tools?: string[],
 *     operations?: string[],
 *     capabilities?: string[],
 *   },
 * }} SkillManifest
 */

/**
 * @param {unknown} raw
 * @returns {SkillManifest}
 */
export function normalizeSkillManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('skill_manifest_required');
  const input = /** @type {Record<string, unknown>} */ (raw);
  const id = String(input.id || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error(`invalid_skill_id:${id}`);

  const instructions = input.instructions && typeof input.instructions === 'object'
    ? /** @type {Record<string, unknown>} */ (input.instructions)
    : null;
  if (!instructions?.source) throw new Error('skill_instructions_source_required');

  const source = String(instructions.source);
  const allowed = new Set(['inline', 'local_file', 'package_file', 'database', 'object_store']);
  if (!allowed.has(source)) throw new Error(`unsupported_instruction_source:${source}`);

  let suggested;
  const slash = input.slash && typeof input.slash === 'object'
    ? /** @type {Record<string, unknown>} */ (input.slash)
    : null;
  if (slash?.suggested) {
    suggested = canonicalizeSlashTrigger(slash.suggested);
  }

  const execution = input.execution && typeof input.execution === 'object'
    ? /** @type {Record<string, unknown>} */ (input.execution)
    : {};

  return {
    schema: 'agentsam.skill.v1',
    id,
    name: String(input.name || id).trim() || id,
    description: String(input.description || '').trim(),
    icon: String(input.icon || 'skill').trim() || 'skill',
    version: input.version != null ? String(input.version) : undefined,
    package: input.package != null ? String(input.package) : undefined,
    slash: suggested ? { suggested } : undefined,
    instructions: {
      source: /** @type {SkillManifest['instructions']['source']} */ (source),
      ref: instructions.ref != null ? String(instructions.ref) : undefined,
      inline: instructions.inline != null ? String(instructions.inline) : undefined,
    },
    execution: {
      mode: 'turn',
      tools: Array.isArray(execution.tools) ? execution.tools.map(String) : [],
      operations: Array.isArray(execution.operations) ? execution.operations.map(String) : [],
      capabilities: Array.isArray(execution.capabilities) ? execution.capabilities.map(String) : [],
    },
  };
}

/**
 * @param {string} id
 * @param {string} [inline]
 * @returns {SkillManifest}
 */
export function createBlankSkillManifest(id, inline = '# New skill\n\nDescribe the playbook.\n') {
  const normalized = String(id || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  return normalizeSkillManifest({
    schema: 'agentsam.skill.v1',
    id: normalized,
    name: normalized,
    description: '',
    icon: 'skill',
    slash: { suggested: `/${normalized}` },
    instructions: { source: 'inline', inline },
    execution: { mode: 'turn', tools: [], operations: [], capabilities: [] },
  });
}
