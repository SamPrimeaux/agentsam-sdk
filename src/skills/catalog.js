import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const skillsRoot = path.resolve(moduleDir, '..', '..', 'skills');
const catalogPath = path.join(skillsRoot, 'catalog.json');

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function normalizeSkillId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveSkillRecord(idOrAlias) {
  const needle = normalizeSkillId(idOrAlias);
  if (!needle) return null;
  const catalog = readCatalog();
  return catalog.skills.find((skill) => {
    if (normalizeSkillId(skill.id) === needle) return true;
    return (skill.aliases ?? []).some((alias) => normalizeSkillId(alias) === needle);
  }) ?? null;
}

function safeSkillPath(relativePath) {
  const resolved = path.resolve(skillsRoot, relativePath);
  const rootWithSep = `${skillsRoot}${path.sep}`;
  if (resolved !== skillsRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error('skill_path_outside_root');
  }
  return resolved;
}

export function listSkills() {
  return readCatalog().skills.map((skill) => ({ ...skill }));
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
    instructions: fs.readFileSync(safeSkillPath(skill.entry), 'utf8'),
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
