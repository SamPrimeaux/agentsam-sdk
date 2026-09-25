import { defineSamOperation } from '../define.js';
import { runCodebaseindexIngest } from '../../commands/codebaseindex.js';

export const codebaseindexIngestOp = defineSamOperation({
  id: 'codebaseindex.ingest',
  version: 1,
  module: 'codebaseindex',
  action: 'ingest',
  summary: 'Inventory-first ingest into the knowledge / code-intelligence spine.',
  purpose:
    'Acquire materials, inventory the environment, confirm scope, resolve embed/storage lanes, dry-run, then index.',
  outcome:
    'A verified knowledge generation (and optional vectors) with job graph, inventory, and receipt — usable by search/agents without re-learning the product for cloud later.',
  skill: { id: 'agentsam-codebaseindex', help: true },
  accepts: [
    'directory', 'archive', 'html', 'image', 'glb', 'code', 'document', 'repository',
  ],
  phases: [
    'material.stage',
    'inventory.classify',
    'scope.resolve',
    'profile.resolve',
    'lane.resolve',
    'plan.dry_run',
    'index.execute',
    'generation.verify',
  ],
  execution: {
    lanes: ['local', 'remote', 'platform'],
    model: 'optional',
    embedding: 'optional',
    network: 'optional',
    sideEffects: 'local_write',
    provider_spend: 'possible',
  },
  risk: 'write',
  capabilities: ['knowledge.index', 'knowledge.search', 'repository.snapshot'],
  artifacts: [
    'inventory.v1',
    'codebaseindex.job.graph.v1',
    'knowledge.generation',
  ],
  cli: { command: [['codebaseindex'], ['ingest']] },
  docs: { section: 'Codebaseindex', examples: ['codebaseindex-ingest-wizard'] },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    return runCodebaseindexIngest(input, ctx);
  },
});
