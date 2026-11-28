import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNpmPackageRoot } from './package-source.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');
const skillsRoot = path.join(repoRoot, 'skills');
const workspacePackageSkillRoot = path.join(repoRoot, 'packages', 'primetech-procedures', 'skills');
function resolvePrimeTechSkillRoot() {
  try {
    return path.join(resolveNpmPackageRoot('@inneranimalmedia/primetech-procedures'), 'skills');
  } catch {
    // Local source fallback for an SDK checkout before npm workspace linking.
    return workspacePackageSkillRoot;
  }
}
const packageSkillRoot = resolvePrimeTechSkillRoot();
const catalogPath = path.join(skillsRoot, 'catalog.json');

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function normalizeSkillId(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Only advertise instructions physically shipped in this SDK distribution.
// The source catalog may contain additional skills intentionally held from npm.
function skillIsAvailable(skill) {
  try {
    return fs.existsSync(resolveSkillFilePath(skill));
  } catch {
    return false;
  }
}

function resolveSkillRecord(idOrAlias) {
  const needle = normalizeSkillId(idOrAlias);
  if (!needle) return null;
  const catalog = readCatalog();
  return catalog.skills.find((skill) => {
    if (!skillIsAvailable(skill)) return false;
    if (normalizeSkillId(skill.id) === needle) return true;
    return (skill.aliases ?? []).some((alias) => normalizeSkillId(alias) === needle);
  }) ?? null;
}

function safeSkillPath(relativePath, skill = null, rootOverride = null) {
  const requestedRoot = rootOverride ? path.resolve(rootOverride) : skillsRoot;
  const isPrimeTechPackageSkill = skill?.package_name === '@inneranimalmedia/primetech-procedures'
    && requestedRoot === skillsRoot;
  const baseRoot = isPrimeTechPackageSkill ? packageSkillRoot : requestedRoot;
  const resolved = path.resolve(baseRoot, relativePath);
  const allowedRoots = isPrimeTechPackageSkill
    ? [packageSkillRoot, workspacePackageSkillRoot]
    : [requestedRoot];
  const allowed = allowedRoots.some((root) =>
    resolved === root || resolved.startsWith(root + path.sep));
  if (!allowed) throw new Error('skill_path_outside_root');
  return resolved;
}

export function resolveSkillFilePath(skill, options = {}) {
  if (!skill?.entry) throw new Error('skill_entry_required');
  return safeSkillPath(skill.entry, skill, options.skillsRoot || null);
}

export function listSkills() {
  return readCatalog().skills.filter(skillIsAvailable).map((skill) => ({ ...skill }));
}

export function getSkill(idOrAlias) {
  const skill = resolveSkillRecord(idOrAlias);
  return skill ? { ...skill } : null;
}

export function loadSkill(idOrAlias, options = {}) {
  const skill = resolveSkillRecord(idOrAlias);
  if (!skill) throw new Error(`unknown_skill:${idOrAlias}`);

  const result = {
    skill: { ...skill },
    instructions: fs.readFileSync(resolveSkillFilePath(skill), 'utf8'),
  };

  if (options.references === true) {
    result.references = (skill.references ?? []).map((relativePath) => ({
      path: relativePath,
      content: fs.readFileSync(safeSkillPath(relativePath), 'utf8'),
    }));
  }

  return result;
}

export const AGENTSAM_SKILLS_ROOT = skillsRoot;
