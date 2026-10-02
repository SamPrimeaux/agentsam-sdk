export function createCompositeCapabilityAdapter(adapters = []) {
  const active = adapters.filter(Boolean);
  if (!active.length || active.some((adapter) => !adapter?.toolDescriptors || !adapter?.invoke)) {
    throw new TypeError('composite_capability_adapters_required');
  }

  function catalog(options = {}) {
    const byName = new Map();
    for (const adapter of active) {
      for (const descriptor of adapter.toolDescriptors(options)) {
        if (byName.has(descriptor.name)) throw new Error(`duplicate_capability_descriptor:${descriptor.name}`);
        byName.set(descriptor.name, { descriptor, adapter });
      }
    }
    return byName;
  }

  return Object.freeze({
    toolDescriptors(options = {}) { return [...catalog(options).values()].map((row) => row.descriptor); },
    canInvoke(id) {
      return active.some((adapter) => typeof adapter.canInvoke === 'function'
        ? adapter.canInvoke(id)
        : adapter.toolDescriptors().some((row) => row.name === id));
    },
    async invoke(id, input = {}, context = {}) {
      const row = catalog().get(String(id));
      if (!row) throw new Error(`capability_handler_unavailable:${id}`);
      return row.adapter.invoke(id, input, context);
    },
  });
}
