import { defineSamOperation } from '../define.js';
import { auditPackages } from '../../commands/package.js';

export const packageAuditOp = defineSamOperation({
  id: 'package.audit',
  version: 1,
  module: 'package',
  action: 'audit',
  summary: 'Audit AgentSam package publication intent, registry state, and structural blockers.',
  purpose:
    'Establish deterministic package-distribution authority for @inneranimalmedia packages without publishing anything.',
  outcome:
    'Return classified package manifests, public-distribution intent, registry state when allowed, and structural blockers.',
  description:
    'Discover scoped package manifests, classify public/private intent, optionally query npm registry state, and return a bounded read-only audit.',
  skill: { id: 'agentsam-progression-guard', help: true },
  accepts: ['root', 'publicOnly', 'offline'],
  phases: ['discover_manifests', 'classify_intent', 'resolve_registry_state', 'emit_audit'],
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    embedding: 'never',
    network: 'optional',
    sideEffects: 'none',
    provider_spend: 'none',
  },
  risk: 'read_only',
  capabilities: ['package.audit'],
  artifacts: ['package.audit'],
  cli: { command: [['package', 'audit']] },
  docs: { section: 'Packages' },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const root = input.root || input.cwd || ctx.cwd || process.cwd();
    return auditPackages({
      root,
      publicOnly: input.publicOnly === true || input.public === true,
      offline: input.offline === true,
    });
  },
});
