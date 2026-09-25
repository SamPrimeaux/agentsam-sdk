import { defineSamOperation } from '../define.js';
import { blenderInspect } from '../../lib/cad/blender.js';

export const cadBlenderInspectOp = defineSamOperation({
  id: 'cad.blender.inspect',
  version: 1,
  module: 'cad',
  action: 'blender.inspect',
  summary: 'Inspect an existing Blender source (.blend).',
  description: 'Host-tool inspect via Blender binary; no model spend. Requires blender on PATH or blenderBin.',
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    network: 'none',
    sideEffects: 'none',
  },
  risk: 'read_only',
  capabilities: ['cad.blender.inspect'],
  cli: { command: [['cad', 'blender', 'inspect']] },
  docs: { section: 'CAD' },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const source = input.source || input.input || input.path;
    if (!source) {
      throw Object.assign(new Error('cad.blender.inspect requires source/input'), {
        code: 'sam_invalid_input',
      });
    }
    return blenderInspect({
      input: source,
      blenderBin: input.blenderBin,
      timeoutSeconds: input.timeoutSeconds,
      cwd: input.cwd || input.root || ctx.cwd || process.cwd(),
    });
  },
});
