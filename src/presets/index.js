const PRESETS = Object.freeze({
  fullstack: Object.freeze({
    id: 'fullstack', version: 1, lane: 'fullstack',
    description: 'Local-first application with AgentSam runtime, repository primitives, knowledge, and delivery hooks.',
    features: ['agent', 'knowledge'],
    capabilities: ['scaffold.create', 'repository.snapshot', 'knowledge.index', 'knowledge.search', 'security.scan', 'deploy.receipt'],
    defaults: { database: 'sqlite', assets: 'local', deploy: 'local' },
  }),
  cms: Object.freeze({
    id: 'cms', version: 1, lane: 'cms',
    description: 'Content-oriented application starting from local CMS primitives with explicit auth/deploy opt-ins.',
    features: ['cms', 'knowledge'],
    capabilities: ['scaffold.create', 'repository.snapshot', 'knowledge.index', 'knowledge.search', 'site.scrape', 'deploy.receipt'],
    defaults: { database: 'sqlite', assets: 'local', deploy: 'local' },
  }),
  prototype: Object.freeze({
    id: 'prototype', version: 1, lane: 'fullstack',
    description: 'Small local prototype with the minimum deterministic AgentSam runtime.',
    features: ['agent'],
    capabilities: ['scaffold.create', 'repository.snapshot', 'security.scan'],
    defaults: { database: 'sqlite', assets: 'local', deploy: 'local' },
  }),
  data: Object.freeze({
    id: 'data', version: 1, lane: 'data',
    description: 'Data-oriented local application with repository knowledge and explicit production storage graduation.',
    features: ['knowledge'],
    capabilities: ['scaffold.create', 'repository.snapshot', 'knowledge.index', 'knowledge.search', 'security.scan'],
    defaults: { database: 'sqlite', assets: 'local', deploy: 'local' },
  }),
});

const ADDONS = Object.freeze({
  agent: Object.freeze({ id: 'agent', capabilities: ['scaffold.create'], description: 'AgentSam local runtime selection.' }),
  auth: Object.freeze({ id: 'auth', capabilities: ['identity.init'], description: 'Identity package selection; use `agentsam identity init` when a standalone auth app scaffold is required.' }),
  cms: Object.freeze({ id: 'cms', capabilities: ['site.scrape'], description: 'CMS/content feature selection.' }),
  knowledge: Object.freeze({ id: 'knowledge', capabilities: ['knowledge.index', 'knowledge.search'], description: 'Portable repository indexing and retrieval.' }),
  'deploy-cloudflare': Object.freeze({ id: 'deploy-cloudflare', capabilities: ['deploy.receipt'], description: 'Select Cloudflare as the intended deploy target; provisioning remains explicit at deploy time.' }),
});

export function listPresets() { return Object.values(PRESETS); }
export function getPreset(id) { return PRESETS[String(id || '').trim().toLowerCase()] || null; }
export function resolvePreset(id = 'fullstack') {
  const preset = getPreset(id);
  if (!preset) throw new Error(`unknown_preset:${id}; expected ${Object.keys(PRESETS).join(',')}`);
  return structuredClone(preset);
}
export function listAddons() { return Object.values(ADDONS); }
export function getAddon(id) { return ADDONS[String(id || '').trim().toLowerCase()] || null; }
