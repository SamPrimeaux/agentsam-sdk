/**
 * Inventory projection for codebaseindex — structured authority + compact ASCII view.
 * The ASCII tree is a projection, not the source of truth.
 *
 * Scope suggestions categorize paths; they never auto-apply exclusions.
 */

import fs from 'node:fs';
import path from 'node:path';

const EXT_LANG = new Map([
  ['.js', 'JavaScript'], ['.mjs', 'JavaScript'], ['.cjs', 'JavaScript'],
  ['.ts', 'TypeScript'], ['.tsx', 'TypeScript'], ['.jsx', 'JavaScript'],
  ['.py', 'Python'], ['.go', 'Go'], ['.rs', 'Rust'], ['.md', 'Markdown'],
  ['.json', 'JSON'], ['.css', 'CSS'], ['.html', 'HTML'], ['.htm', 'HTML'],
  ['.yml', 'YAML'], ['.yaml', 'YAML'], ['.sql', 'SQL'], ['.sh', 'Shell'],
]);

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const MODEL3D = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl']);
const ARCHIVE = new Set(['.zip', '.tar', '.tgz', '.gz']);

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

/** Tooling / CI — review before including. */
const CATEGORY_TOOLING = new Set([
  'bin', 'scripts', 'tools', '.github', '.changeset', '.husky', '.vscode',
  '.cursor', 'tags', 'test', 'tests', '__tests__', 'spec', 'e2e',
]);

/** Generated / historical — review before including. */
const CATEGORY_GENERATED = new Set([
  'generated', 'fixtures', 'snapshots', 'artifacts', 'public', 'static',
  'site', 'sites', 'templates', 'level-1', 'focus-timer',
]);

/** AgentSam / config control plane — review. */
const CATEGORY_CONFIG = new Set([
  '.agentsam', 'migrations', 'registry', 'wrangler', 'deploy',
]);

const SUGGEST_EXCLUDE_NAMES = CATEGORY_DEPENDENCIES;

function classifyTopLevel(name) {
  if (CATEGORY_DEPENDENCIES.has(name)) return 'dependencies';
  if (CATEGORY_SOURCE.has(name)) return 'source';
  if (CATEGORY_DOCS.has(name)) return 'docs';
  if (CATEGORY_GENERATED.has(name)) return 'generated';
  if (CATEGORY_CONFIG.has(name)) return 'config';
  if (CATEGORY_TOOLING.has(name)) return 'tooling';
  if (/^(old|legacy|archive|backup|tmp|temp)/i.test(name)) return 'historical';
  if (name.startsWith('.')) return 'config';
  return 'unknown';
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
      if (!SUGGEST_EXCLUDE_NAMES.has(ent.name)) walk(root, child, acc, depth + 1);
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
        language: EXT_LANG.get(ext) || null,
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
  const languages = {};
  let locTotal = 0;
  for (const f of files.slice(0, opts.maxFiles || 4000)) {
    if (!f.language) continue;
    const loc = countLoc(root, f.path);
    languages[f.language] = (languages[f.language] || 0) + loc;
    locTotal += loc;
  }
  const images = files.filter((f) => f.media === 'image').length;
  const models3d = files.filter((f) => f.media === 'model3d').length;
  const archives = files.filter((f) => f.media === 'archive').length;
  const packageManifests = files.filter((f) => f.name === 'package.json').length;

  /** @type {Record<string, string[]>} */
  const categories = {
    source: [],
    docs: [],
    config: [],
    generated: [],
    dependencies: [],
    tooling: [],
    historical: [],
    unknown: [],
  };
  for (const name of top) {
    categories[classifyTopLevel(name)].push(name);
  }

  const primaryInclude = [
    ...categories.source,
    ...categories.docs,
  ];
  const reviewInclude = [
    ...categories.config,
    ...categories.generated,
    ...categories.tooling.filter((n) => n === 'test' || n === 'tests' || n === 'scripts'),
  ];
  const usuallyExclude = [
    ...categories.dependencies,
    ...categories.tooling.filter((n) => !reviewInclude.includes(n) && n !== 'scripts' && n !== 'test' && n !== 'tests'),
    ...categories.historical,
  ];

  // Default starting include: primary source + docs (not "everything").
  // Exclusions are candidates only — never auto-applied without user confirm.
  const suggestedInclude = (primaryInclude.length ? primaryInclude : top.filter((n) => !CATEGORY_DEPENDENCIES.has(n))).slice(0, 24);
  if (!suggestedInclude.length) suggestedInclude.push('.');
  const suggestedExclude = [...new Set(usuallyExclude)];

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
    top_level: top,
    categories,
    suggested: {
      include: suggestedInclude,
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
    const mark = cat ? ` · ${cat}` : '';
    lines.push(`├── ${name}/${mark}`);
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
  lines.push('');
  lines.push('Recommended scope candidates');
  lines.push(`  Primary source     ${(inventory.categories?.source || []).join(', ') || '(none)'}`);
  lines.push(`  Documentation      ${(inventory.categories?.docs || []).join(', ') || '(none)'}`);
  lines.push(`  Review before incl ${(inventory.suggested?.review || []).join(', ') || '(none)'}`);
  lines.push(`  Usually exclude    ${(inventory.suggested?.exclude || []).join(', ') || '(none)'}`);
  lines.push('  (No exclusions applied automatically.)');
  lines.push('');
  lines.push('Starting suggestion (editable)');
  lines.push(`  include: ${(inventory.suggested.include || []).join(', ') || '(none)'}`);
  lines.push(`  exclude: ${(inventory.suggested.exclude || []).join(', ') || '(none)'}`);
  return lines.join('\n');
}

export { classifyTopLevel };
