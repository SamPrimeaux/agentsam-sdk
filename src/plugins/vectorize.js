function clean(value) { return value == null ? '' : String(value).trim(); }

export function resolveVectorizeConfig(tool, context = {}, args = {}) {
  const config = tool?.handler_config || {};
  const scope = context.resourceScope || context.resource_scope || {};
  const bindingName = clean(args.binding || config.binding || scope.binding);
  const indexName = clean(args.index || config.index || scope.index);
  const model = clean(args.model || config.model || scope.model) || null;
  if (!bindingName || !indexName) throw new Error('project_vectorize_binding_and_index_required');
  const binding = typeof context.resolveBinding === 'function'
    ? context.resolveBinding(bindingName, { tool, scope })
    : context.bindings?.[bindingName];
  if (!binding || typeof binding.query !== 'function') throw new Error(`project_vectorize_binding_unavailable:${bindingName}`);
  return { binding, bindingName, indexName, model, dimensions: Number(config.dimensions || scope.dimensions || 0) || null };
}

export async function executeVectorizeTool({ tool, args = {}, context = {} }) {
  const { binding, bindingName, indexName, model, dimensions } = resolveVectorizeConfig(tool, context, args);
  const operation = clean(args.operation || tool.handler_config?.operation || 'query').toLowerCase();
  const index = typeof binding.get === 'function' ? binding.get(indexName) : binding;
  if (!index) throw new Error(`project_vectorize_index_unavailable:${bindingName}:${indexName}`);
  if (operation === 'query') {
    const vector = args.vector || (typeof context.embed === 'function' ? await context.embed(String(args.text || args.q || ''), { model, dimensions }) : null);
    if (!Array.isArray(vector)) throw new Error('project_vectorize_query_vector_required');
    if (dimensions && vector.length !== dimensions) throw new Error(`project_vectorize_dimension_mismatch:${vector.length}!=${dimensions}`);
    return index.query(vector, { topK: Number(args.topK || args.top_k || 10), returnMetadata: args.returnMetadata !== false, namespace: args.namespace });
  }
  if (operation === 'upsert') return index.upsert(args.vectors || args.items || []);
  if (operation === 'delete') return index.deleteByIds(args.ids || []);
  throw new Error(`project_vectorize_operation_unsupported:${operation}`);
}
