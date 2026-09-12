function clean(value) { return value == null ? '' : String(value).trim(); }

export function hydrateToolSchemas(catalog = [], selected = [], options = {}) {
  if (!Array.isArray(catalog)) throw new TypeError('catalog must be an array');
  if (!Array.isArray(selected)) throw new TypeError('selected must be an array');
  const maxTools = Number.isInteger(options.maxTools) && options.maxTools > 0 ? options.maxTools : 8;
  const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : 40_000;
  const wanted = [...new Set(selected.map(clean).filter(Boolean))].slice(0, maxTools);
  const byName = new Map(catalog.map((tool) => [clean(tool.tool || tool.name), tool]).filter(([name]) => name));
  const tools = [];
  const missing = [];
  const deferred = [];
  let schemaChars = 0;

  for (const name of wanted) {
    const tool = byName.get(name);
    if (!tool) { missing.push(name); continue; }
    const size = JSON.stringify(tool).length;
    if (schemaChars + size > maxChars) { deferred.push(name); continue; }
    tools.push(Object.freeze({ ...tool }));
    schemaChars += size;
  }

  return Object.freeze({
    tools: Object.freeze(tools),
    receipt: Object.freeze({
      catalog_items: catalog.length,
      requested_tools: wanted.length,
      hydrated_tools: tools.length,
      schema_chars: schemaChars,
      missing_tools: Object.freeze(missing),
      deferred_tools: Object.freeze(deferred),
    }),
  });
}
