import { defineSamOperation } from '../define.js';
import { terminalExec } from '../../capabilities/index.js';

export const terminalExecOp = defineSamOperation({
  id: 'terminal.exec',
  version: 1,
  module: 'terminal',
  action: 'exec',
  summary: 'Execute a bounded argv process inside the project root.',
  description: 'Model-callable terminal primitive with cwd sandboxing, timeouts, and redacted diagnostics.',
  execution: {
    lanes: ['local', 'sandbox'],
    model: 'never',
    network: 'optional',
    sideEffects: 'local_write',
  },
  risk: 'write',
  capabilities: ['terminal.exec'],
  cli: { command: [] },
  docs: { section: 'Tools' },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const cwd = input.projectRoot || input.cwd || ctx.cwd || process.cwd();
    return terminalExec(
      { ...input, cwd: input.cwd || cwd },
      { cwd, signal: ctx.signal, env: ctx.env },
    );
  },
});
