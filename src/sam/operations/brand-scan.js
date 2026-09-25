import { defineSamOperation } from '../define.js';
import { repositorySnapshot } from '../../capabilities/index.js';
import { brandScan } from '../../../packages/agentsam-brand/src/index.js';

/**
 * Brand intelligence — evidence-backed BrandPack candidate chain (scan remains read-only).
 * Preview/export are separate operations with local_write side effects.
 */
export const brandScanOp = defineSamOperation({
  id: 'brand.scan',
  version: 1,
  module: 'brand',
  action: 'scan',
  summary: 'Audit materials into evidence-backed brand intelligence.',
  purpose:
    'Audit a repository and supplied materials into evidence-backed brand intelligence.',
  outcome:
    'Produce a BrandPack candidate describing observed brand assets, tokens, typography, themes, components, layouts, URLs, content references, conflicts and normalization opportunities.',
  description:
    'Deterministic evidence extraction over repository.snapshot authority — tokens, assets, typography, components, conflicts. Does not mutate the source tree.',
  skill: { id: 'agentsam-app-fundamentals', help: true },
  accepts: [
    'repository', 'directory', 'html', 'css', 'javascript', 'typescript',
    'image', 'svg', 'archive', 'glb', 'gltf', 'text',
  ],
  phases: [
    'inventory',
    'evidence',
    'brand-observation',
    'normalization',
    'theme-proposal',
    'brandpack',
  ],
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'optional',
    embedding: 'never',
    network: 'optional',
    sideEffects: 'none',
    provider_spend: 'possible',
  },
  risk: 'read_only',
  capabilities: ['brand.scan', 'repository.snapshot'],
  artifacts: ['brandpack.candidate', 'brand.evidence', 'theme.proposal'],
  preview: { available: true, operation: 'brand.preview' },
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
