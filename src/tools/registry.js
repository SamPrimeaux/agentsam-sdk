function clean(value) {
  return value == null ? '' : String(value).trim();
}

function assertToolDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('tool definition must be an object');
  }
  if (!clean(definition.toolKey)) throw new TypeError('tool definition requires toolKey');
  if (!clean(definition.capabilityKey)) throw new TypeError(`tool ${definition.toolKey} requires capabilityKey`);
  if (!definition.inputSchema || typeof definition.inputSchema !== 'object') {
    throw new TypeError(`tool ${definition.toolKey} requires inputSchema`);
  }
  if (!definition.outputSchema || typeof definition.outputSchema !== 'object') {
    throw new TypeError(`tool ${definition.toolKey} requires outputSchema`);
  }
  return definition;
}

export function createToolRegistry({ tools = [], adapters = [], handlers = [] } = {}) {
  const toolsByKey = new Map();
  const adaptersByProvider = new Map();
  const handlersByRef = new Map();

  function registerTool(definition) {
    assertToolDefinition(definition);
    const key = clean(definition.toolKey);
    if (toolsByKey.has(key)) throw new Error(`duplicate tool definition: ${key}`);
    toolsByKey.set(key, Object.freeze({ ...definition }));
    return toolsByKey.get(key);
  }

  function registerAdapter(adapter) {
    const providerKey = clean(adapter?.providerKey);
    if (!providerKey || typeof adapter?.invoke !== 'function') {
      throw new TypeError('provider adapter requires providerKey and invoke()');
    }
    if (adaptersByProvider.has(providerKey)) throw new Error(`duplicate provider adapter: ${providerKey}`);
    adaptersByProvider.set(providerKey, adapter);
    return adapter;
  }

  function registerHandler(ref, handler) {
    const key = clean(ref);
    if (!key || typeof handler !== 'function') {
      throw new TypeError('tool handler requires a ref and function');
    }
    if (handlersByRef.has(key)) throw new Error(`duplicate tool handler: ${key}`);
    handlersByRef.set(key, handler);
    return handler;
  }

  for (const definition of tools) registerTool(definition);
  for (const adapter of adapters) registerAdapter(adapter);
  if (handlers instanceof Map) {
    for (const [ref, handler] of handlers) registerHandler(ref, handler);
  } else if (Array.isArray(handlers)) {
    for (const entry of handlers) registerHandler(entry?.ref, entry?.handler);
  } else if (handlers && typeof handlers === 'object') {
    for (const [ref, handler] of Object.entries(handlers)) registerHandler(ref, handler);
  }

  return Object.freeze({
    registerTool,
    registerAdapter,
    registerHandler,
    getTool(toolKey) {
      return toolsByKey.get(clean(toolKey)) || null;
    },
    getAdapter(providerKey) {
      return adaptersByProvider.get(clean(providerKey)) || null;
    },
    getHandler(ref) {
      return handlersByRef.get(clean(ref)) || null;
    },
    listTools({ activeOnly = true } = {}) {
      return [...toolsByKey.values()].filter((tool) => !activeOnly || tool.active !== false);
    },
    listProviders() {
      return [...adaptersByProvider.keys()];
    },
  });
}
