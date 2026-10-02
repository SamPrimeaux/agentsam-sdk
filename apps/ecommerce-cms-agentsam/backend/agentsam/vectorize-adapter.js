/**
 * Generic AgentSam Vectorize adapter.
 *
 * The tool row owns binding/model/index/filter details. This keeps Vectorize
 * execution portable across ecommerce-cms-agentsam installs instead of hiding
 * FNF-specific configuration in code.
 */

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requireBinding(env, name, method) {
  const binding = name ? env?.[name] : null;
  if (!binding || typeof binding[method] !== "function") {
    throw new Error(`Vectorize binding ${name || "(missing)"} does not implement ${method}`);
  }
  return binding;
}

function configuredFilter(config, params) {
  const filter = {
    ...asObject(params.filter),
    ...asObject(config.filter),
    ...asObject(config.static_filter),
  };

  // Configured scope always wins over model/user input.
  if (config.account_id) filter.account_id = String(config.account_id);

  const sourceType = params.source_type || config.default_source_type;
  if (sourceType) filter.source_type = String(sourceType);

  return filter;
}

async function createEmbedding(env, config, text) {
  const input = String(text || "").trim();
  if (!input) throw new Error("embedding input required");

  const aiBindingName = config.ai_binding || config.embedding_binding || "AGENTSAM_WAI";
  const ai = env?.[aiBindingName] || env?.AI;
  if (!ai?.run) {
    throw new Error(`Workers AI binding ${aiBindingName} is not configured`);
  }

  const model = config.embed_model || config.embedding_model;
  if (!model) throw new Error("handler_config.embed_model is required");

  const options = {};
  if (config.gateway_id) {
    options.gateway = {
      id: String(config.gateway_id),
      skipCache: config.gateway_skip_cache !== false,
    };
  }

  const response = await ai.run(model, { text: [input] }, options);
  const embedding = response?.data?.[0] ?? response?.result?.[0];
  const expectedDimensions = Number(config.dimensions || 0);

  if (!Array.isArray(embedding)) {
    throw new Error("embedding provider returned no vector");
  }
  if (expectedDimensions > 0 && embedding.length !== expectedDimensions) {
    throw new Error(
      `Unexpected embedding dimensions: ${embedding.length}; expected ${expectedDimensions}`,
    );
  }

  return embedding;
}

function normalizeMatches(result) {
  return result?.matches || result?.result?.matches || [];
}

async function executeQuery(env, tool, params, config) {
  const binding = requireBinding(env, config.binding, "query");
  const query = String(params.query || params.q || params.text || "").trim();
  if (!query && !Array.isArray(params.embedding)) {
    return { ok: false, error: "query_required", tool_key: tool.tool_key };
  }

  const embedding =
    params.embedding ||
    (await createEmbedding(env, config, query));

  const maxTopK = Math.max(1, Number(config.max_top_k || 20));
  const topK = Math.min(
    Math.max(1, Number(params.top_k || params.topK || config.default_top_k || 8)),
    maxTopK,
  );
  const filter = configuredFilter(config, params);
  const queryOptions = {
    topK,
    returnMetadata: config.return_metadata || "all",
  };
  if (Object.keys(filter).length) queryOptions.filter = filter;

  const started = Date.now();
  const result = await binding.query(embedding, queryOptions);
  const matches = normalizeMatches(result).map((match) => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata || {},
    source_type: match.metadata?.source_type || null,
    source_key: match.metadata?.source_key || match.metadata?.title || null,
    title: match.metadata?.title || null,
    text_preview: String(
      match.metadata?.text_preview || match.metadata?.text || "",
    ).slice(0, Number(config.preview_chars || 480)),
  }));

  return {
    ok: true,
    tool_key: tool.tool_key,
    operation: "query",
    binding: config.binding,
    index: config.index_name || null,
    embedding_model: config.embed_model || config.embedding_model || null,
    query,
    top_k: topK,
    latency_ms: Date.now() - started,
    match_count: matches.length,
    matches,
  };
}

async function executeUpsert(env, tool, params, config) {
  const method = config.write_method === "insert" ? "insert" : "upsert";
  const binding = requireBinding(env, config.binding, method);
  const vectors = Array.isArray(params.vectors) ? params.vectors : [];

  if (!vectors.length) {
    return { ok: false, error: "vectors_required", tool_key: tool.tool_key };
  }

  const normalized = [];
  for (const item of vectors) {
    if (!item?.id) throw new Error("every vector requires id");
    let values = item.values;
    if (!Array.isArray(values)) {
      values = await createEmbedding(env, config, item.text);
    }
    const expectedDimensions = Number(config.dimensions || 0);
    if (expectedDimensions > 0 && values.length !== expectedDimensions) {
      throw new Error(
        `Vector ${item.id} has ${values.length} dimensions; expected ${expectedDimensions}`,
      );
    }
    normalized.push({
      id: String(item.id),
      values,
      metadata: {
        ...asObject(item.metadata),
        ...asObject(config.write_metadata),
      },
    });
  }

  await binding[method](normalized);
  return {
    ok: true,
    tool_key: tool.tool_key,
    operation: method,
    binding: config.binding,
    index: config.index_name || null,
    count: normalized.length,
  };
}

async function executeDelete(env, tool, params, config) {
  const binding = requireBinding(env, config.binding, "deleteByIds");
  const ids = Array.isArray(params.ids) ? params.ids.map(String) : [];
  if (!ids.length) {
    return { ok: false, error: "ids_required", tool_key: tool.tool_key };
  }
  await binding.deleteByIds(ids);
  return {
    ok: true,
    tool_key: tool.tool_key,
    operation: "delete",
    binding: config.binding,
    index: config.index_name || null,
    count: ids.length,
  };
}

async function executeGetByIds(env, tool, params, config) {
  const binding = requireBinding(env, config.binding, "getByIds");
  const ids = Array.isArray(params.ids) ? params.ids.map(String) : [];
  if (!ids.length) {
    return { ok: false, error: "ids_required", tool_key: tool.tool_key };
  }
  const vectors = await binding.getByIds(ids);
  return {
    ok: true,
    tool_key: tool.tool_key,
    operation: "get_by_ids",
    binding: config.binding,
    index: config.index_name || null,
    vectors,
  };
}

export async function executeVectorizeTool(env, tool, params = {}) {
  const config = asObject(tool?.handler_config);
  const operation = String(config.operation || "query").toLowerCase();

  switch (operation) {
    case "query":
    case "search":
      return executeQuery(env, tool, params, config);
    case "upsert":
    case "insert":
      return executeUpsert(env, tool, params, config);
    case "delete":
    case "delete_by_ids":
      return executeDelete(env, tool, params, config);
    case "get":
    case "get_by_ids":
      return executeGetByIds(env, tool, params, config);
    default:
      return {
        ok: false,
        error: "vectorize_operation_not_supported",
        tool_key: tool?.tool_key,
        operation,
      };
  }
}
