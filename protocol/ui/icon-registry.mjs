/**
 * agentsam.icon.v1 — semantic vocabulary registry (additive-only).
 * Persist keys only. Renderer packages map keys → Lucide / CLI glyphs / native.
 */

/** @type {readonly string[]} */
export const AGENTSAM_ICON_KEYS = Object.freeze([
  'generic',
  'agent',
  'app',
  'project',
  'package',
  'plugin',
  'inspect',
  'search',
  'code',
  'terminal',
  'browser',
  'workflow',
  'database',
  'storage',
  'vector',
  'data',
  'repository',
  'file',
  'folder',
  'document',
  'artifact',
  'image',
  'memory',
  'model',
  'provider',
  'tool',
  'skill',
  'integration',
  'connection',
  'api',
  'identity',
  'key',
  'security',
  'network',
  'cloud',
  'deploy',
  'brand',
  'theme',
  'settings',
  'metrics',
  'logs',
]);

/** @type {Readonly<Record<string, string>>} */
export const ICON_ALIASES = Object.freeze({
  db: 'database',
  repo: 'repository',
  repos: 'repository',
  files: 'file',
  dirs: 'folder',
  directories: 'folder',
  docs: 'document',
  doc: 'document',
  img: 'image',
  media: 'image',
  auth: 'identity',
  secret: 'key',
  secrets: 'key',
  vault: 'key',
  embeddings: 'vector',
  vectors: 'vector',
  sql: 'database',
  d1: 'database',
  config: 'settings',
});

/** @type {Readonly<Record<string, { category: string, label: string }>>} */
export const ICON_CATALOG = Object.freeze({
  generic: { category: 'system', label: 'Generic' },
  agent: { category: 'runtime', label: 'Agent' },
  app: { category: 'product', label: 'App' },
  project: { category: 'product', label: 'Project' },
  package: { category: 'product', label: 'Package' },
  plugin: { category: 'product', label: 'Plugin' },
  inspect: { category: 'runtime', label: 'Inspect' },
  search: { category: 'runtime', label: 'Search' },
  code: { category: 'runtime', label: 'Code' },
  terminal: { category: 'runtime', label: 'Terminal' },
  browser: { category: 'runtime', label: 'Browser' },
  workflow: { category: 'runtime', label: 'Workflow' },
  database: { category: 'data', label: 'Database' },
  storage: { category: 'data', label: 'Storage' },
  vector: { category: 'data', label: 'Vector' },
  data: { category: 'data', label: 'Data' },
  repository: { category: 'product', label: 'Repository' },
  file: { category: 'product', label: 'File' },
  folder: { category: 'product', label: 'Folder' },
  document: { category: 'product', label: 'Document' },
  artifact: { category: 'product', label: 'Artifact' },
  image: { category: 'product', label: 'Image' },
  memory: { category: 'ai', label: 'Memory' },
  model: { category: 'ai', label: 'Model' },
  provider: { category: 'ai', label: 'Provider' },
  tool: { category: 'runtime', label: 'Tool' },
  skill: { category: 'runtime', label: 'Skill' },
  integration: { category: 'connectivity', label: 'Integration' },
  connection: { category: 'connectivity', label: 'Connection' },
  api: { category: 'connectivity', label: 'API' },
  identity: { category: 'security', label: 'Identity' },
  key: { category: 'security', label: 'Key' },
  security: { category: 'security', label: 'Security' },
  network: { category: 'connectivity', label: 'Network' },
  cloud: { category: 'connectivity', label: 'Cloud' },
  deploy: { category: 'runtime', label: 'Deploy' },
  brand: { category: 'design', label: 'Brand' },
  theme: { category: 'design', label: 'Theme' },
  settings: { category: 'system', label: 'Settings' },
  metrics: { category: 'observability', label: 'Metrics' },
  logs: { category: 'observability', label: 'Logs' },
});

export const CLI_ICON_GLYPHS = Object.freeze({
  generic: '●',
  inspect: '◇',
  search: '⌕',
  code: '›_',
  terminal: '›',
  database: '▦',
  storage: '▦',
  vector: '◎',
  data: '▦',
  package: '□',
  deploy: '↑',
  security: '◆',
  identity: '◆',
  key: '◆',
  workflow: '↳',
  skill: '●',
  agent: '●',
  app: '□',
  project: '□',
  repository: '□',
  file: '□',
  folder: '□',
  document: '□',
  artifact: '□',
  image: '□',
  settings: '◇',
  brand: '◇',
  theme: '◇',
  metrics: '⌕',
  logs: '⌕',
  connection: '⌕',
  integration: '⌕',
  api: '⌕',
  network: '⌕',
  cloud: '⌕',
  browser: '⌕',
  tool: '›',
  plugin: '□',
  memory: '◇',
  model: '◎',
  provider: '◎',
});

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeIconKey(raw) {
  const input = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^lucide[-_]/, '')
    .replace(/^heroicons?[-_]/, '');
  if (!input) return 'generic';
  const aliased = ICON_ALIASES[input] || input;
  if (AGENTSAM_ICON_KEYS.includes(aliased)) return aliased;
  return 'generic';
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isAgentsamIconKey(raw) {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  return AGENTSAM_ICON_KEYS.includes(k);
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveCliIconGlyph(raw) {
  const key = normalizeIconKey(raw);
  return CLI_ICON_GLYPHS[key] || CLI_ICON_GLYPHS.generic;
}

/**
 * @param {unknown} raw
 * @returns {{ key: string, category: string, label: string }}
 */
export function resolveIconMeta(raw) {
  const key = normalizeIconKey(raw);
  const meta = ICON_CATALOG[key] || ICON_CATALOG.generic;
  return { key, category: meta.category, label: meta.label };
}

/**
 * @template T
 * @param {Partial<Record<string, T>>} mapping
 * @param {T} genericFallback
 * @returns {(raw: unknown) => T}
 */
export function createIconRenderer(mapping, genericFallback) {
  return (raw) => {
    const key = normalizeIconKey(raw);
    if (Object.prototype.hasOwnProperty.call(mapping, key) && mapping[key] != null) {
      return /** @type {T} */ (mapping[key]);
    }
    if (Object.prototype.hasOwnProperty.call(mapping, 'generic') && mapping.generic != null) {
      return /** @type {T} */ (mapping.generic);
    }
    return genericFallback;
  };
}
