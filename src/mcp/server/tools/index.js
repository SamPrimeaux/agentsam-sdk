import { z } from 'zod';

function textResult(value, structuredContent) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function toolError(error, details = {}) {
  return {
    isError: true,
    content: [{ type: 'text', text: error }],
    structuredContent: { error, ...details },
  };
}

export function registerAuthorizedTool(server, manifest, principal, name, inputSchema, handler) {
  const definition = manifest.tools.find((item) => item.name === name);
  if (!definition) throw new Error('mcp_tool_manifest_entry_missing:' + name);

  server.registerTool(name, {
    title: definition.title,
    description: definition.description,
    inputSchema,
    annotations: definition.annotations,
  }, async (input) => {
    const granted = new Set(principal?.scopes || []);
    const required = definition.required_scopes || [];
    const missing = principal?.kind === 'public' ? [] : required.filter((scope) => !granted.has(scope));
    if (missing.length) return toolError('insufficient_scope', { missing_scopes: missing });
    return handler(input);
  });
}

export function registerTools(server, { manifest, principal }) {
  registerAuthorizedTool(server, manifest, principal, 'system.health', {}, async () => {
    const health = {
      ok: true,
      name: manifest.name,
      version: manifest.version,
      tool_count: manifest.tools.length,
      checked_at: new Date().toISOString(),
    };
    return textResult(health, health);
  });

  registerAuthorizedTool(server, manifest, principal, 'system.info', {}, async () => {
    const info = { manifest, tools: manifest.tools };
    return textResult(info, info);
  });

  registerAuthorizedTool(server, manifest, principal, 'text.transform', {
    text: z.string().max(10000),
    operation: z.enum(['trim', 'uppercase', 'lowercase', 'slugify']),
  }, async ({ text, operation }) => {
    let result = text;
    if (operation === 'trim') result = text.trim();
    if (operation === 'uppercase') result = text.toUpperCase();
    if (operation === 'lowercase') result = text.toLowerCase();
    if (operation === 'slugify') {
      result = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    return textResult(result, { operation, result });
  });

  registerAuthorizedTool(server, manifest, principal, 'math.calculate', {
    left: z.number().finite(),
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    right: z.number().finite(),
  }, async ({ left, operation, right }) => {
    if (operation === 'divide' && right === 0) return toolError('division_by_zero');
    const result = operation === 'add' ? left + right
      : operation === 'subtract' ? left - right
        : operation === 'multiply' ? left * right
          : left / right;
    if (!Number.isFinite(result)) return toolError('calculation_result_out_of_range');
    return textResult(result, { left, operation, right, result });
  });
}
