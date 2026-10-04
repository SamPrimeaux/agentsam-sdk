/**
 * Inventory projection for codebaseindex — structured authority + compact ASCII view.
 * The ASCII tree is a projection, not the source of truth.
 *
 * Scope suggestions categorize paths; they never auto-apply exclusions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  sourceLanguageForExtension,
  sourceTypeForExtension,
} from '../../../packages/agentsam-repository/src/source-types.js';
import {
  finalizeStyleEvidence,
  inspectStyleEvidenceFile,
  mergeStyleEvidence,
} from './style-evidence.js';

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const MODEL3D = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl']);
const ARCHIVE = new Set(['.zip', '.tar', '.tgz', '.gz']);

const ROOT_SECRET = /^(\.env(\..+)?|\.dev\.vars(\..+)?|.+\.(pem|key|p12|pfx))$/i;
const ROOT_TEMPLATE = /\.(example|sample|template)$/i;
const ROOT_LOCKFILE = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock)$/;
const ROOT_MANIFEST = /^(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|requirements[\w.-]*\.txt|wrangler(?:\.[\w-]+)?\.(toml|jsonc?)|tsconfig[\w.-]*\.json|.+\.config\.[cm]?[jt]s)$/i;
const ROOT_DOCS = /^(README|CHANGELOG|CONTRIBUTING|SECURITY|AGENTS|AGENTSAM|CLAUDE|LICENSE)(\..+)?$/i;

/** Usually exclude — dependency / build caches (candidates only). */
const CATEGORY_DEPENDENCIES = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo',
  '.cache', 'out', 'target', '__pycache__', '.venv', 'venv', '.wrangler',
]);

/** Primary source candidates. */
const CATEGORY_SOURCE = new Set([
  'src', 'apps', 'packages', 'protocol', 'python', 'services', 'lib', 'server',
  'worker', 'workers', 'runtime', 'cmd', 'internal', 'pkg',
]);

/** Documentation / examples. */
const CATEGORY_DOCS = new Set([
  'docs', 'examples', 'guides', 'handbook', 'README', 'changelog',
]);

/** Static/public assets — review before including as searchable source. */
const CATEGORY_ASSETS = new Set(['public', 'static']);

/** Tooling / CI — review before including. */
const CATEGORY_TOOLING = new Set([
  'bin', 'scripts', 'tools', '.github', '.changeset', '.husky', '.vscode',
  '.cursor', 'tags', 'test', 'tests', '__tests__', 'spec', 'e2e',
]);

/** Generated / historical — review before including. */
const CATEGORY_GENERATED = new Set([
  'generated', 'fixtures', 'snapshots', 'artifacts',
  'site', 'sites', 'templates', 'level-1',
]);

/** AgentSam / config control plane — review. */
const CATEGORY_CONFIG = new Set([
  'migrations', 'registry', 'wrangler', 'deploy',
]);

const CATEGORY_OPERATIONAL = new Set(['.agentsam']);

const SUGGEST_EXCLUDE_NAMES = CATEGORY_DEPENDENCIES;

function cargoWorkspaceSourceRoots(root) {
  const manifest = path.join(root, 'Cargo.toml');
  let text;
  try { text = fs.readFileSync(manifest, 'utf8'); } catch { return []; }

  let inWorkspace = false;
  let collectingMembers = false;
  let membersText = '';

  for (const rawLine of text.split(String.fromCharCode(10))) {
    const line = rawLine.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      inWorkspace = line === '[workspace]';
      collectingMembers = false;
      continue;
    }
    if (!inWorkspace) continue;

    if (!collectingMembers && line.startsWith('members')) {
      const equals = line.indexOf('=');
      if (equals < 0) continue;
      membersText = line.slice(equals + 1).trim();
      collectingMembers = !membersText.includes(']');
    } else if (collectingMembers) {
      membersText += ' ' + line;
      collectingMembers = !line.includes(']');
    }

    if (membersText && !collectingMembers) break;
  }

  const open = membersText.indexOf('[');
  const close = membersText.lastIndexOf(']');
  if (open < 0 || close <= open) return [];

  const members = [];
  const body = membersText.slice(open + 1, close);
  let quote = '';
  let value = '';
  for (const char of body) {
    if (!quote && (char === '"' || char === "'")) {
      quote = char;
      value = '';
      continue;
    }
    if (quote && char === quote) {
      members.push(value);
      quote = '';
      value = '';
      continue;
    }
    if (quote) value += char;
  }

  const roots = [];
  for (let member of members) {
    member = member.trim();
    if (member.startsWith('./')) member = member.slice(2);
    if (!member || member === '.') continue;
    let rootName = member.split('/')[0];
    const wildcardPositions = ['?', '*', '[', '{']
      .map((token) => rootName.indexOf(token))
      .filter((index) => index >= 0);
    if (wildcardPositions.length) rootName = rootName.slice(0, Math.min(...wildcardPositions));
    if (rootName && fs.existsSync(path.join(root, rootName))) roots.push(rootName);
  }
  return [...new Set(roots)].sort();
}

function classifyTopLevel(name, sourceRoots = []) {
  if (CATEGORY_DEPENDENCIES.has(name)) return 'dependencies';
  if (sourceRoots.includes(name) || CATEGORY_SOURCE.has(name)) return 'source';
  if (CATEGORY_DOCS.has(name)) return 'docs';
  if (CATEGORY_ASSETS.has(name)) return 'assets';
  if (CATEGORY_GENERATED.has(name)) return 'generated';
  if (CATEGORY_OPERATIONAL.has(name)) return 'operational';
  if (CATEGORY_CONFIG.has(name)) return 'config';
  if (CATEGORY_TOOLING.has(name)) return 'tooling';
  if (/^(old|legacy|archive|backup|tmp|temp)/i.test(name)) return 'historical';
  if (name.startsWith('.')) return 'config';
  return 'unknown';
}

function isGitIgnored(root, relPath) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function directoryEvidence(entries, name) {
  const prefix = `${name}/`;
  const evidence = { code: 0, docs: 0, data: 0, media: 0 };
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.path.startsWith(prefix)) continue;
    const sourceType = sourceTypeForExtension(entry.ext);
    if (sourceType?.kind === 'code') evidence.code += 1;
    else if (sourceType?.id === 'markdown' || sourceType?.id === 'text') evidence.docs += 1;
    else if (sourceType?.kind === 'document') evidence.data += 1;
    else if (entry.media === 'image' || entry.media === 'model3d') evidence.media += 1;
  }
  return evidence;
}

function classifyByEvidence(root, name, entries) {
  if (isGitIgnored(root, name)) return name.startsWith('.') ? 'operational' : 'generated';
  const evidence = directoryEvidence(entries, name);
  const ranked = [
    ['source', evidence.code],
    ['docs', evidence.docs],
    ['data', evidence.data],
    ['assets', evidence.media],
  ].sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : null;
}

function classifyRootFile(entry) {
  const name = entry.name;
  if (ROOT_SECRET.test(name) && !ROOT_TEMPLATE.test(name)) return 'secret';
  if (ROOT_LOCKFILE.test(name)) return 'lockfile';
  if (ROOT_MANIFEST.test(name)) return 'manifest';
  if (ROOT_DOCS.test(name)) return 'docs';
  return sourceTypeForExtension(entry.ext)?.kind === 'code' ? 'source' : 'config';
}

function isGitTrackedPath(root, relPath) {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--', relPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Boolean(output);
  } catch {
    return false;
  }
}

function walk(root, rel = '', acc = [], depth = 0) {
  if (depth > 6 || acc.length > 8000) return acc;
  const abs = rel ? path.join(root, rel) : root;
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); }
  catch { return acc; }
  for (const ent of entries) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    const full = path.join(root, child);
    if (ent.isDirectory()) {
      acc.push({ path: child, kind: 'directory', name: ent.name });
      if (SUGGEST_EXCLUDE_NAMES.has(ent.name)) continue;
      if (depth === 0 && isGitIgnored(root, child)) continue;
      walk(root, child, acc, depth + 1);
    } else if (ent.isFile()) {
      let bytes = 0;
      try { bytes = fs.statSync(full).size; } catch { /* ignore */ }
      const ext = path.extname(ent.name).toLowerCase();
      acc.push({
        path: child,
        kind: 'file',
        name: ent.name,
        ext,
        bytes,
        language: sourceLanguageForExtension(ext),
        media: IMAGE.has(ext) ? 'image' : MODEL3D.has(ext) ? 'model3d' : ARCHIVE.has(ext) ? 'archive' : null,
      });
    }
  }
  return acc;
}

function countLoc(root, filePath, maxBytes = 256_000) {
  try {
    const full = path.join(root, filePath);
    const st = fs.statSync(full);
    if (st.size > maxBytes) return 0;
    const text = fs.readFileSync(full, 'utf8');
    if (text.includes('\0')) return 0;
    return text.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

/**
 * @param {{ root: string, materials?: object|null, maxFiles?: number }} opts
 */
export function buildInventory(opts) {
  const root = path.resolve(opts.root);
  const entries = walk(root);
  const files = entries.filter((e) => e.kind === 'file');
  const dirs = entries.filter((e) => e.kind === 'directory');
  const top = dirs.filter((d) => !d.path.includes('/')).map((d) => d.name);
  const rootEntries = files.filter((f) => !f.path.includes('/'));
  const cargoWorkspaceRoots = cargoWorkspaceSourceRoots(root);
  const languages = {};
  const topLevelDetails = {};
  let styleEvidence = null;
  let locTotal = 0;
  for (const name of top) {
    topLevelDetails[name] = {
      files: 0,
      loc: 0,
      dominant_language: null,
      language_loc: {},
      evidence: directoryEvidence(entries, name),
    };
  }
  for (const f of files.slice(0, opts.maxFiles || 4000)) {
    const topName = f.path.includes('/') ? f.path.split('/')[0] : null;
    if (topName && topLevelDetails[topName]) topLevelDetails[topName].files += 1;

    const style = inspectStyleEvidenceFile(root, f.path);
    if (style) styleEvidence = mergeStyleEvidence(styleEvidence, style);

    if (!f.language) continue;
    const loc = countLoc(root, f.path);
    languages[f.language] = (languages[f.language] || 0) + loc;
    locTotal += loc;
    if (topName && topLevelDetails[topName]) {
      const detail = topLevelDetails[topName];
      detail.loc += loc;
      detail.language_loc[f.language] = (detail.language_loc[f.language] || 0) + loc;
    }
  }
  for (const detail of Object.values(topLevelDetails)) {
    const ranked = Object.entries(detail.language_loc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    detail.dominant_language = ranked[0]?.[0] || null;
  }
  const images = files.filter((f) => f.media === 'image').length;
  const models3d = files.filter((f) => f.media === 'model3d').length;
  const archives = files.filter((f) => f.media === 'archive').length;
  const packageManifests = files.filter((f) => f.name === 'package.json').length;

  /** @type {Record<string, string[]>} */
  const categories = {
    source: [],
    docs: [],
    data: [],
    assets: [],
    config: [],
    generated: [],
    dependencies: [],
    operational: [],
    tooling: [],
    historical: [],
    unknown: [],
  };
  for (const name of top) {
    let category;
    if (isGitIgnored(root, name)) {
      category = name.startsWith('.') ? 'operational' : 'generated';
    } else {
      category = classifyTopLevel(name, cargoWorkspaceRoots);
      if (category === 'unknown') category = classifyByEvidence(root, name, entries) || category;
    }
    categories[category].push(name);
  }

  const rootFiles = {
    manifest: [],
    docs: [],
    source: [],
    config: [],
    lockfile: [],
    secret: [],
  };
  for (const entry of rootEntries) rootFiles[classifyRootFile(entry)].push(entry.path);
  for (const values of Object.values(rootFiles)) values.sort();

  const topLanguages = Object.entries(languages)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([language]) => language);
  const promotedTooling = categories.tooling.filter((name) => {
    const detail = topLevelDetails[name];
    return isGitTrackedPath(root, name)
      && topLanguages.some((language) => (detail?.language_loc?.[language] || 0) > 0);
  });

  const primaryInclude = [
    ...categories.source,
    ...categories.docs,
    ...promotedTooling,
  ];
  const reviewInclude = [
    ...categories.data,
    ...categories.assets,
    ...categories.config,
    ...categories.generated,
    ...categories.tooling.filter((n) => !promotedTooling.includes(n)),
  ];
  const usuallyExclude = [
    ...categories.dependencies,
    ...categories.operational,
    ...categories.tooling.filter((n) => !reviewInclude.includes(n) && n !== 'scripts' && n !== 'test' && n !== 'tests'),
    ...categories.historical,
  ];

  // Default starting include: primary source + docs (not "everything").
  // Exclusions are candidates only — never auto-applied without user confirm.
  const suggestedInclude = (primaryInclude.length ? primaryInclude : top.filter((n) => !CATEGORY_DEPENDENCIES.has(n))).slice(0, 24);
  if (!suggestedInclude.length) suggestedInclude.push('.');
  const suggestedExclude = [...new Set(usuallyExclude)];
  const suggestedIncludeFiles = [
    ...rootFiles.manifest,
    ...rootFiles.docs,
    ...rootFiles.source,
  ];

  /** @type {object} */
  const inventory = {
    schema: 'agentsam.inventory.v1',
    root,
    scanned_at: new Date().toISOString(),
    counts: {
      files: files.length,
      directories: dirs.length,
      loc_sampled: locTotal,
      images,
      models3d,
      archives,
      package_manifests: packageManifests,
    },
    languages,
    style_evidence: finalizeStyleEvidence(styleEvidence),
    cargo_workspace_roots: cargoWorkspaceRoots,
    top_level: top,
    top_level_details: topLevelDetails,
    categories,
    root_files: rootFiles,
    suggested: {
      include: suggestedInclude,
      include_files: suggestedIncludeFiles,
      exclude: suggestedExclude,
      review: reviewInclude,
      note: 'Categories are machine inventory. Suggestions are advisory — no exclusions applied automatically. User confirmations are authoritative.',
    },
    materials: opts.materials || null,
    sample_paths: files.slice(0, 40).map((f) => f.path),
  };
  return inventory;
}

/**
 * Compact human projection of inventory (not authority).
 * @param {ReturnType<typeof buildInventory>} inventory
 */
export function formatInventoryTree(inventory) {
  const lines = [];
  lines.push(`repository  ${inventory.root}`);
  lines.push(`files ${inventory.counts.files} · dirs ${inventory.counts.directories} · LOC~${inventory.counts.loc_sampled}`);
  lines.push('');
  for (const name of inventory.top_level.slice(0, 24)) {
    const cat = inventory.categories
      ? Object.entries(inventory.categories).find(([, names]) => names.includes(name))?.[0]
      : null;
    const detail = inventory.top_level_details?.[name];
    const mark = cat ? ` · ${cat}` : '';
    const evidence = detail
      ? ` · ${detail.files} files · LOC~${detail.loc}${detail.dominant_language ? ` · ${detail.dominant_language}` : ''}`
      : '';
    lines.push(`├── ${name}/${mark}${evidence}`);
  }
  if (inventory.top_level.length > 24) lines.push('└── …');
  lines.push('');
  lines.push('Languages');
  const langs = Object.entries(inventory.languages || {}).sort((a, b) => b[1] - a[1]);
  for (const [lang, loc] of langs.slice(0, 8)) {
    lines.push(`  ${lang.padEnd(14)} ${String(loc).padStart(8)} LOC`);
  }
  lines.push('');
  lines.push('Detected');
  lines.push(`  ${inventory.counts.package_manifests} package.json`);
  lines.push(`  ${inventory.counts.images} images · ${inventory.counts.models3d} 3D · ${inventory.counts.archives} archives`);
  const style = inventory.style_evidence;
  if (style?.theme_candidate) {
    const presets = Object.keys(style.theme_presets || {});
    const namespaces = (style.namespaces || []).filter((row) => row.candidate).slice(0, 5);
    lines.push(`  theme evidence  presets=${presets.join(', ') || '(none)'} namespaces=${namespaces.map((row) => row.prefix).join(', ') || '(none)'}`);
  }
  lines.push('');
  lines.push('Root files');
  for (const [kind, names] of Object.entries(inventory.root_files || {})) {
    if (names.length) lines.push(`  ${kind.padEnd(10)} ${names.join(', ')}`);
  }
  lines.push('');
  lines.push('Recommended scope candidates');
  lines.push(`  Primary source     ${(inventory.categories?.source || []).join(', ') || '(none)'}`);
  lines.push(`  Documentation      ${(inventory.categories?.docs || []).join(', ') || '(none)'}`);
  lines.push(`  Review before incl ${(inventory.suggested?.review || []).join(', ') || '(none)'}`);
  lines.push(`  Usually exclude    ${(inventory.suggested?.exclude || []).join(', ') || '(none)'}`);
  lines.push('  (No exclusions applied automatically.)');
  lines.push('');
  lines.push('Starting suggestion (editable)');
  lines.push(`  include dirs:  ${(inventory.suggested.include || []).join(', ') || '(none)'}`);
  lines.push(`  include files: ${(inventory.suggested.include_files || []).join(', ') || '(none)'}`);
  lines.push(`  exclude:       ${(inventory.suggested.exclude || []).join(', ') || '(none)'}`);
  return lines.join('\n');
}

export { classifyTopLevel };
