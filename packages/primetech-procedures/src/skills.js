import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SKILL_ROOT = fileURLToPath(new URL('../skills/', import.meta.url));

export const PRIMETECH_SKILL_CONTRACT_SECTIONS = Object.freeze([
  'Trigger conditions', 'Inputs', 'Prerequisites', 'Workflow', 'Artifact contract',
  'Quality gates', 'Persistence', 'Iteration', 'Handoff', 'Failure handling',
]);

function parseFrontmatter(markdown) {
  const match = String(markdown).match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return { valid: false, name: null, description: null };
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const row = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (row) values[row[1]] = row[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { valid: true, name: values.name || null, description: values.description || null };
}

function validateSkillManifest(manifest, markdown, dirName, known = {}) {
  const errors = [];
  if (!manifest || manifest.schema !== 'agentsam.skill.v1') errors.push('manifest.schema must be agentsam.skill.v1');
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(manifest?.id || '')) errors.push('manifest.id is invalid');
  if (manifest?.id !== dirName) errors.push('directory name must equal manifest.id');
  if (typeof manifest?.name !== 'string' || !manifest.name.trim()) errors.push('manifest.name is required');
  if (typeof manifest?.description !== 'string' || !manifest.description.trim()) errors.push('manifest.description is required');
  if (!/^\/[a-z0-9][a-z0-9-]*$/.test(manifest?.slash?.suggested || '')) errors.push('manifest.slash.suggested is invalid');
  if (manifest?.instructions?.source !== 'local_file' || manifest?.instructions?.ref !== 'SKILL.md') errors.push('instructions must resolve to local SKILL.md');
  if (manifest?.execution?.mode !== 'turn') errors.push('execution.mode must be turn');
  for (const key of ['tools', 'operations', 'capabilities']) {
    const values = manifest?.execution?.[key];
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) errors.push(`execution.${key} must be an array of non-empty strings`);
    else if (new Set(values).size !== values.length) errors.push(`execution.${key} contains duplicates`);
  }
  const frontmatter = parseFrontmatter(markdown);
  if (!frontmatter.valid || !frontmatter.name || !frontmatter.description) errors.push('SKILL.md frontmatter requires name and description');
  if (frontmatter.name && frontmatter.name !== manifest.name) errors.push('frontmatter name must match manifest name');
  if (frontmatter.description && frontmatter.description !== manifest.description) errors.push('frontmatter description must match manifest description');
  for (const section of PRIMETECH_SKILL_CONTRACT_SECTIONS) {
    const pattern = new RegExp(`^#{2,3}\\s+(?:\\d+\\.\\s*)?${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'im');
    if (!pattern.test(markdown)) errors.push(`missing Universal Skill Contract section: ${section}`);
  }
  for (const [key, available] of Object.entries(known)) {
    if (!Array.isArray(available)) continue;
    const refs = manifest?.execution?.[key] || [];
    for (const ref of refs) if (!available.includes(ref)) errors.push(`unknown execution.${key} reference: ${ref}`);
  }
  return { id: manifest?.id || dirName, name: manifest?.name || dirName, slash: manifest?.slash?.suggested || null, errors, valid: errors.length === 0 };
}

export async function loadPrimeTechSkillCatalog({ root = DEFAULT_SKILL_ROOT } = {}) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(root, entry.name);
    const [manifestText, markdown] = await Promise.all([
      fs.readFile(path.join(dir, 'agentsam.skill.json'), 'utf8'),
      fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'),
    ]);
    skills.push({ directory: entry.name, manifest: JSON.parse(manifestText), markdown, path: dir });
  }
  return skills;
}

export async function validatePrimeTechSkillPackage({ root, knownTools = null, knownOperations = null, knownCapabilities = null, expectedCount = null } = {}) {
  const skills = await loadPrimeTechSkillCatalog({ root });
  const known = {};
  if (knownTools) known.tools = knownTools;
  if (knownOperations) known.operations = knownOperations;
  if (knownCapabilities) known.capabilities = knownCapabilities;
  const seenIds = new Set();
  const seenSlashes = new Set();
  const results = skills.map(skill => {
    const result = validateSkillManifest(skill.manifest, skill.markdown, skill.directory, known);
    if (seenIds.has(result.id)) result.errors.push('duplicate skill id');
    if (seenSlashes.has(result.slash)) result.errors.push('duplicate slash trigger');
    seenIds.add(result.id);
    seenSlashes.add(result.slash);
    result.valid = result.errors.length === 0;
    return result;
  });
  const errors = [];
  if (expectedCount !== null && skills.length !== expectedCount) errors.push(`expected ${expectedCount} skills; found ${skills.length}`);
  return {
    schema: 'agentsam.primetech.skill-catalog-validation.v1',
    valid: errors.length === 0 && results.every(result => result.valid),
    count: skills.length,
    validCount: results.filter(result => result.valid).length,
    invalidCount: results.filter(result => !result.valid).length,
    errors,
    skills: results,
  };
}

export async function getPrimeTechSkill({ root, id }) {
  const skills = await loadPrimeTechSkillCatalog({ root });
  return skills.find(skill => skill.manifest.id === id) || null;
}
