import { defineSamOperation } from '../define.js';
import { repositorySnapshot } from '../../capabilities/index.js';

/**
 * repository.inspect — user-facing inspect over deterministic snapshot evidence.
 * Capability authority remains repository.snapshot; inspect is the SAM operation projection.
 */
export const repositoryInspect = defineSamOperation({
  id: 'repository.inspect',
  version: 1,
  module: 'repository',
  action: 'inspect',
  summary: 'Inspect repository structure and semantic evidence.',
  description:
    'Collect a read-only, content-addressed repository evidence snapshot (merkle, intelligence, packages, deploy receipt).',
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    network: 'none',
    sideEffects: 'none',
  },
  risk: 'read_only',
  capabilities: ['repository.snapshot', 'repository.ast', 'repository.merkle'],
  cli: { command: [['inspect']] },
  docs: { section: 'Repository', examples: ['repository-inspect-basic'] },
  input_schema: 'protocol/capabilities/repository-snapshot-input.schema.json',
  output_schema: 'protocol/capabilities/repository-snapshot.schema.json',
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const root = typeof input === 'string'
      ? input
      : (input.root || input.cwd || ctx.cwd || process.cwd());
    const churnDays = Number.isInteger(input.churnDays) ? input.churnDays : 30;
    const snapshot = await repositorySnapshot({ cwd: root, churnDays });
    return {
      summary: snapshot.intelligence?.summary || null,
      repository: snapshot.repository || null,
      snapshot_id: snapshot.snapshot_id || null,
      merkle_root: snapshot.tree?.merkle_root || null,
      snapshot,
    };
  },
});
