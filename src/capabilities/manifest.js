const CAPABILITIES = Object.freeze({
  'repository.snapshot': Object.freeze({
    id: 'repository.snapshot',
    version: 1,
    domain: 'repository',
    runtime: 'node+python',
    package: '@inneranimalmedia/agentsam-sdk/repository',
    export: 'repositorySnapshot',
    cli: 'agentsam inspect --json',
    description: 'Collect a read-only, content-addressed repository evidence snapshot.',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    input_schema: 'protocol/capabilities/repository-snapshot-input.schema.json',
    output_schema: 'protocol/capabilities/repository-snapshot.schema.json',
    status: 'stable',
  }),
  'repository.intelligence': Object.freeze({
    id: 'repository.intelligence',
    version: 1,
    domain: 'repository',
    runtime: 'python',
    package: '@inneranimalmedia/agentsam-sdk/repository',
    cli: 'agentsam repo snapshot',
    description: 'Observe repository composition, manifests, churn, pressure, and stability.',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    status: 'stable',
  }),
  'knowledge.index': Object.freeze({
    id: 'knowledge.index', version: 1, domain: 'repository', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk/knowledge', cli: 'agentsam index run',
    description: 'Build a coherent incremental AST/text generation with optional embeddings.',
    deterministic: true, model_required: false, side_effects: 'local-state', status: 'stable',
  }),
  'knowledge.search': Object.freeze({
    id: 'knowledge.search', version: 1, domain: 'repository', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk/knowledge', cli: 'agentsam search "query"',
    description: 'Retrieve bounded repository context from a published knowledge generation.',
    deterministic: true, model_required: false, side_effects: 'none', status: 'stable',
  }),
  'merkle.snapshot': Object.freeze({
    id: 'merkle.snapshot', version: 1, domain: 'integrity', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk/merkle', cli: 'agentsam merkle snapshot',
    description: 'Create a portable SHA-256 filesystem snapshot.',
    deterministic: true, model_required: false, side_effects: 'local-state', status: 'stable',
  }),
  'deploy.receipt': Object.freeze({
    id: 'deploy.receipt', version: 1, domain: 'delivery', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk/deploy-receipt', cli: 'agentsam deploy-receipt capture',
    description: 'Capture and finalize content-addressed deployment evidence.',
    deterministic: true, model_required: false, side_effects: 'local-state', status: 'stable',
  }),
  'security.scan': Object.freeze({
    id: 'security.scan', version: 1, domain: 'security', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk/security', cli: 'agentsam security scan',
    description: 'Inventory dependency state and optionally query vulnerability evidence.',
    deterministic: true, model_required: false, side_effects: 'network-optional', status: 'stable',
  }),
  'identity.init': Object.freeze({
    id: 'identity.init', version: 1, domain: 'app', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk/identity', cli: 'agentsam identity init',
    description: 'Generate portable identity/auth application surfaces from SDK contracts.',
    deterministic: true, model_required: false, side_effects: 'filesystem', status: 'stable',
  }),
  'scaffold.create': Object.freeze({
    id: 'scaffold.create', version: 1, domain: 'app', runtime: 'node',
    package: '@inneranimalmedia/agentsam-sdk', cli: 'agentsam create <name> --preset <preset>',
    description: 'Create a local-first project from a deterministic preset selection.',
    deterministic: true, model_required: false, side_effects: 'filesystem', status: 'stable',
  }),
  'recon.pack': Object.freeze({
    id: 'recon.pack', version: 1, domain: 'agent', runtime: 'node+python',
    package: '@inneranimalmedia/agentsam-sdk/repository', cli: 'agentsam recon pack',
    description: 'Convert explicit evidence slices into bounded worker task packets.',
    deterministic: true, model_required: false, side_effects: 'none', status: 'stable',
  }),
  'site.scrape': Object.freeze({
    id: 'site.scrape', version: 1, domain: 'web', runtime: 'python',
    package: 'agentsam-site-scrape', cli: 'python -m agentsam_site_scrape',
    description: 'Crawl a bounded public site and prepare page/image assets for local or R2 ingest.',
    deterministic: true, model_required: false, side_effects: 'network+filesystem', status: 'stable',
  }),
});

export const CAPABILITY_MANIFEST_VERSION = 1;

export function listCapabilities({ domain, status = 'stable' } = {}) {
  return Object.values(CAPABILITIES).filter((row) => (!domain || row.domain === domain) && (!status || row.status === status));
}

export function getCapability(id) {
  return CAPABILITIES[String(id || '').trim()] || null;
}

export function getCapabilityManifest() {
  return Object.freeze({
    schema_version: CAPABILITY_MANIFEST_VERSION,
    package: '@inneranimalmedia/agentsam-sdk',
    capabilities: Object.fromEntries(Object.entries(CAPABILITIES)),
  });
}
