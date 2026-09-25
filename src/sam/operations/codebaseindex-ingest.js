import { defineSamOperation } from '../define.js';
import { runCodebaseindexIngest } from '../../commands/codebaseindex.js';

/**
 * codebaseindex.ingest — guided/local projection of sam.codebaseindex.index.run.
 * Host IAM may escalate to the full account-scoped pipeline; this handler is the portable lane.
 */
export const codebaseindexIngestOp = defineSamOperation({
  id: 'codebaseindex.ingest',
  version: 1,
  module: 'codebaseindex',
  action: 'ingest',
  summary: 'Ingest repository and/or dropped materials into the knowledge index.',
  description:
    'Stage pasted archives/files (zip, tar, html, images, glb), configure allowlist + embedding/storage, then plan or run local knowledge indexing. Pipeline id: sam.codebaseindex.index.run.',
  execution: {
    lanes: ['local', 'remote', 'platform'],
    model: 'optional',
    network: 'optional',
    sideEffects: 'local_write',
  },
  risk: 'write',
  capabilities: ['knowledge.index', 'knowledge.search'],
  cli: { command: [['codebaseindex'], ['ingest']] },
  docs: { section: 'Codebaseindex', examples: ['codebaseindex-ingest-wizard'] },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    return runCodebaseindexIngest(input, ctx);
  },
});
