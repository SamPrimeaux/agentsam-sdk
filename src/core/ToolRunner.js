import { createTrace, errorResult, okResult } from './ToolResult.js';

export class ToolRunner {
  constructor(options = {}) {
    this.runtime = options.runtime || 'local';
    this.tools = new Map();
  }

  registerTool(name, handler, options = {}) {
    if (!name || typeof name !== 'string') throw new Error('Tool name is required');
    if (typeof handler !== 'function') throw new Error(`Tool handler is required for ${name}`);
    this.tools.set(name, { name, handler, options });
    return this;
  }

  listTools() {
    return [...this.tools.values()].map(({ name, options }) => ({
      name,
      description: options.description || '',
      readOnly: Boolean(options.readOnly),
      requiresApproval: Boolean(options.requiresApproval),
    }));
  }

  async runTool(name, input = {}, context = {}) {
    const tool = this.tools.get(name);
    const trace = createTrace({ runtime: context.runtime || this.runtime });

    if (!tool) {
      return errorResult(name || 'unknown', 'tool_not_found', `Tool not found: ${name}`, undefined, trace);
    }

    try {
      const data = await tool.handler(input, { ...context, tool: tool.name, trace });
      if (data && typeof data === 'object' && 'ok' in data && 'trace' in data) return data;
      return okResult(tool.name, data, trace);
    } catch (error) {
      return errorResult(
        tool.name,
        error?.code || 'tool_exception',
        error?.message || String(error),
        error?.details,
        trace,
      );
    }
  }
}

export function createDefaultToolRunner(options = {}) {
  return new ToolRunner(options);
}
