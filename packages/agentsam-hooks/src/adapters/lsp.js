const LSP_TOOLS = Object.freeze([
  {
    name: 'lsp.hover',
    method: 'textDocument/hover',
    description: 'Read type, symbol, and documentation information at a source position.',
    required: ['document_uri', 'line', 'character'],
  },
  {
    name: 'lsp.definition',
    method: 'textDocument/definition',
    description: 'Find the definition locations for a symbol at a source position.',
    required: ['document_uri', 'line', 'character'],
  },
  {
    name: 'lsp.references',
    method: 'textDocument/references',
    description: 'Find source references for a symbol at a source position.',
    required: ['document_uri', 'line', 'character'],
  },
  {
    name: 'lsp.symbols',
    method: 'textDocument/documentSymbol',
    description: 'List the structural symbols in a source document.',
    required: ['document_uri'],
  },
  {
    name: 'lsp.diagnostics',
    method: 'textDocument/diagnostic',
    description: 'Request current diagnostics for a source document.',
    required: ['document_uri'],
  },
]);

function descriptor(tool, languages) {
  const properties = {
    language: {
      type: 'string',
      description: 'Configured language-server key.',
      ...(languages.length ? { enum: languages } : {}),
    },
    document_uri: { type: 'string', description: 'Absolute file URI for the source document.' },
    line: { type: 'integer', minimum: 0 },
    character: { type: 'integer', minimum: 0 },
    include_declaration: { type: 'boolean' },
    previous_result_id: { type: 'string' },
  };
  return Object.freeze({
    name: tool.name,
    description: tool.description,
    category: 'lsp',
    risk: 'read',
    strict: true,
    protocol: 'lsp',
    input_schema: {
      type: 'object',
      properties,
      required: ['language', ...tool.required],
      additionalProperties: false,
    },
  });
}

function paramsFor(tool, input) {
  const textDocument = { uri: input.document_uri };
  if (tool.method === 'textDocument/documentSymbol') return { textDocument };
  if (tool.method === 'textDocument/diagnostic') return { textDocument, ...(input.previous_result_id ? { previousResultId: input.previous_result_id } : {}) };
  const position = { line: input.line, character: input.character };
  if (tool.method === 'textDocument/references') {
    return { textDocument, position, context: { includeDeclaration: input.include_declaration !== false } };
  }
  return { textDocument, position };
}

export function createLspCapabilityAdapter(options = {}) {
  if (typeof options.request !== 'function') throw new TypeError('lsp_request_adapter_required');
  const languages = Object.keys(options.languages || {}).sort();
  const byName = new Map(LSP_TOOLS.map((tool) => [tool.name, tool]));
  return Object.freeze({
    toolDescriptors() { return LSP_TOOLS.map((tool) => descriptor(tool, languages)); },
    canInvoke(id) { return byName.has(String(id)); },
    async invoke(id, input = {}, context = {}) {
      const tool = byName.get(String(id));
      if (!tool) throw new Error(`lsp_capability_unavailable:${id}`);
      const language = String(input.language || '').trim();
      if (!language) throw new TypeError('lsp_language_required');
      if (languages.length && !Object.hasOwn(options.languages, language)) throw new Error(`lsp_language_not_configured:${language}`);
      return options.request(language, tool.method, paramsFor(tool, input), {
        ...context,
        server: options.languages?.[language] || null,
      });
    },
  });
}
