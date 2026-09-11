import { DEFAULT_RESULT_POLICY } from '../context/result-policy.js';

const CATALOG = {
  fullstack: [
    { name: 'plan', description: 'Break a goal into implementation steps.' },
    { name: 'code', description: 'Generate or revise application code.' },
    { name: 'deploy', description: 'Prepare deployment steps and checks.' },
  ],
  cms: [
    { name: 'page', description: 'Create and revise pages.' },
    { name: 'asset', description: 'Attach cover images and media.' },
    { name: 'publish', description: 'Draft, preview, and publish content.' },
  ],
  data: [
    { name: 'schema', description: 'Inspect and plan database schemas.' },
    { name: 'query', description: 'Draft safe SQL queries.' },
    { name: 'migration', description: 'Plan D1 or Postgres migrations.' },
  ],
  crm: [
    { name: 'contact', description: 'Organize contacts and accounts.' },
    { name: 'workflow', description: 'Coordinate customer workflows.' },
  ],
  creative: [
    { name: 'brief', description: 'Turn creative intent into a production brief.' },
    { name: 'asset', description: 'Plan media, 3D, and design assets.' },
  ],
};

export function normalizeLane(lane = 'fullstack') {
  return String(lane).toLowerCase().replace(/\s+/g, '').replace('&', '');
}

export function getToolCatalog(lane = 'fullstack') {
  const key = normalizeLane(lane);
  const rows = key.includes('cms') ? CATALOG.cms
    : key.includes('data') ? CATALOG.data
      : (key.includes('customer') || key.includes('crm')) ? CATALOG.crm
        : (key.includes('creative') || key.includes('design')) ? CATALOG.creative
          : CATALOG.fullstack;
  return rows.map((tool) => ({
    ...tool,
    result_policy: { ...DEFAULT_RESULT_POLICY },
  }));
}
