/**
 * Demo adapters — marketing scenes consume real product surfaces.
 * Adapters are contracts; hosts inject implementations.
 */

export const DEMO_ADAPTERS = Object.freeze({
  'agentsam-mini-composer': {
    id: 'agentsam-mini-composer',
    label: 'AgentSam MiniComposer',
    description: 'Real AgentSam / MiniComposer workspace with optional marketingDemoProvider.',
    product: 'agentsam',
    modes: ['demo', 'interactive'],
    storyStages: ['intro', 'prompt', 'plan', 'edit', 'runtime', 'receipt', 'exit'],
  },
  'database-editor': {
    id: 'database-editor',
    label: 'Database Editor',
    description: 'Lightweight D1/SQLite editor preview (schema, grid, query).',
    product: 'database',
    modes: ['demo', 'interactive'],
    capabilities: ['schema', 'query', 'crud', 'metrics'],
  },
  'cad-viewer': {
    id: 'cad-viewer',
    label: 'CAD / Model Viewer',
    description: 'GLB/glTF turntable + poster; BrandPack model role.',
    product: 'cad',
    modes: ['demo', 'interactive'],
  },
  'generic-iframe': {
    id: 'generic-iframe',
    label: 'Generic Iframe',
    description: 'Escape hatch for hosted demos (games, embeds). Prefer real adapters.',
    product: null,
    modes: ['static', 'interactive'],
  },
});

export function getDemoAdapter(id) {
  return DEMO_ADAPTERS[id] || null;
}

export function listDemoAdapters() {
  return Object.values(DEMO_ADAPTERS);
}

/**
 * DemoHost descriptor — host apps bind adapter → component.
 * @param {string} adapter
 * @param {object} [options]
 */
export function createDemoHost(adapter, options = {}) {
  const meta = DEMO_ADAPTERS[adapter];
  if (!meta) {
    throw new Error(`Unknown demo adapter: ${adapter}`);
  }
  return {
    kind: 'demo-host',
    adapter,
    mode: options.mode || 'demo',
    props: options.props || {},
    provider: options.provider || 'marketingDemoProvider',
    meta,
  };
}
