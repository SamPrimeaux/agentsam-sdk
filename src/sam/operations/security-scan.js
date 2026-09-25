import { defineSamOperation } from '../define.js';
import { scanProjectSecurity } from '../../security/scan.js';

export const securityScanOp = defineSamOperation({
  id: 'security.scan',
  version: 1,
  module: 'security',
  action: 'scan',
  summary: 'Scan project dependencies and trust boundary (SCA).',
  description: 'Deterministic security scan; network optional for OSV advisory lookup.',
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    network: 'optional',
    sideEffects: 'none',
  },
  risk: 'read_only',
  capabilities: ['security.scan'],
  cli: { command: [['security', 'scan'], ['sca', 'scan']] },
  docs: { section: 'Security' },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const root = typeof input === 'string'
      ? input
      : (input.root || input.cwd || input.projectRoot || ctx.cwd || process.cwd());
    return scanProjectSecurity({
      projectRoot: root,
      offline: input.offline === true,
      log: input.log,
      signal: ctx.signal,
    });
  },
});
