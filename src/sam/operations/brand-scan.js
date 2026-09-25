import { defineSamOperation } from '../define.js';
import { repositorySnapshot } from '../../capabilities/index.js';
import { brandScan } from '../../../packages/agentsam-brand/src/index.js';

export const brandScanOp = defineSamOperation({
  id: 'brand.scan',
  version: 1,
  module: 'brand',
  action: 'scan',
  summary: 'Inspect repository material and derive brand evidence.',
  description: 'Deterministic brand token/evidence extraction over a repository.snapshot.',
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    network: 'none',
    sideEffects: 'none',
  },
  risk: 'read_only',
  capabilities: ['brand.scan', 'repository.snapshot'],
  cli: { command: [['brand', 'scan']] },
  docs: { section: 'Brand', examples: ['brand-scan-basic'] },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const root = typeof input === 'string'
      ? input
      : (input.root || input.cwd || ctx.cwd || process.cwd());
    const snapshot = input.snapshot
      || await repositorySnapshot({ cwd: root, churnDays: 30 });
    return brandScan({
      cwd: root,
      snapshot,
      maxFiles: input.maxFiles,
      onEvent: input.onEvent,
    });
  },
});
