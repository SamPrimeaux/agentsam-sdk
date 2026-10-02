/**
 * FNF Vectorize — dedicated BGE M3 1024-dim index (never agentsam-*-1536).
 */

import { FNF_ACCOUNT_ID } from "./constants.js";

export const FNF_VECTORIZE_INDEX = "fnf-agentsam-bge-m3-1024";
export const FNF_EMBED_MODEL = "@cf/baai/bge-m3";
export const FNF_EMBED_DIMS = 1024;

const FORBIDDEN_INDEX_PREFIXES = ["agentsam-", "agentsam_"];

export function assertFnfVectorizeIndex(indexName) {
  const name = String(indexName || "").toLowerCase();
  for (const prefix of FORBIDDEN_INDEX_PREFIXES) {
    if (name.startsWith(prefix) && name.includes("1536")) {
      throw new Error(`FNF worker must not use IAM 1536-dim index: ${indexName}`);
    }
  }
  if (name.includes("1536") && name.includes("agentsam")) {
    throw new Error(`FNF worker must not use agentsam 1536-dim index: ${indexName}`);
  }
}

export function getFnfVectorizeBinding(env) {
  const binding = env?.FNF_VECTORIZE;
  if (!binding?.query) return null;
  return binding;
}

function workspaceFilter() {
  return { account_id: FNF_ACCOUNT_ID };
}

export async function createFnfEmbedding(env, text) {
  const input = String(text || "").trim();
  if (!input) throw new Error("embedding input required");
  if (!env?.AGENTSAM_WAI?.run && !env?.AI?.run) {
    throw new Error("Workers AI binding required for FNF embeddings");
  }

  const ai = env.AGENTSAM_WAI || env.AI;
  const resp = await ai.run(FNF_EMBED_MODEL, { text: [input] }, { gateway: { id: "fuelnfreetime-agentsam", skipCache: true } });
  const emb = resp?.data?.[0] ?? resp?.result?.[0];
  if (!Array.isArray(emb) || emb.length !== FNF_EMBED_DIMS) {
    throw new Error(`Unexpected embedding dimensions: ${emb?.length ?? 0}`);
  }
  return emb;
}

export async function queryFnfVectorize(env, queryText, options = {}) {
  const binding = getFnfVectorizeBinding(env);
  if (!binding) {
    return { ok: false, skipped: "no_binding", matches: [] };
  }

  assertFnfVectorizeIndex(FNF_VECTORIZE_INDEX);

  const embedding = options.embedding || (await createFnfEmbedding(env, queryText));
  if (!Array.isArray(embedding) || embedding.length !== FNF_EMBED_DIMS) {
    throw new Error("Invalid query embedding dimensions");
  }

  const topK = Math.min(Math.max(1, Number(options.top_k || options.topK) || 8), 20);
  const filter = {
    ...workspaceFilter(),
    ...(options.source_type ? { source_type: String(options.source_type) } : {}),
    ...(options.filter && typeof options.filter === "object" ? options.filter : {}),
  };

  const result = await binding.query(embedding, {
    topK,
    returnMetadata: "all",
    filter,
  });

  const matches = (result?.matches || result?.result?.matches || []).filter((m) => {
    const ws = m?.metadata?.account_id;
    return !ws || ws === FNF_ACCOUNT_ID;
  });

  return {
    ok: true,
    index: FNF_VECTORIZE_INDEX,
    top_k: topK,
    match_count: matches.length,
    matches,
  };
}

export async function executeFnfSemanticSearch(env, params = {}) {
  const query = String(params.query || params.q || "").trim();
  if (!query) {
    return { ok: false, error: "query required" };
  }

  const started = Date.now();
  const result = await queryFnfVectorize(env, query, {
    top_k: params.top_k || params.limit || 8,
    source_type: params.source_type || null,
  });

  const matches = (result.matches || []).map((m) => ({
    id: m.id,
    score: m.score,
    source_type: m.metadata?.source_type || null,
    source_key: m.metadata?.source_key || m.metadata?.title || null,
    title: m.metadata?.title || null,
    chunk_index: m.metadata?.chunk_index ?? null,
    text_preview: String(m.metadata?.text_preview || m.metadata?.text || "").slice(0, 480),
  }));

  return {
    ok: result.ok !== false,
    tool_key: "fnf_semantic_search",
    query,
    latency_ms: Date.now() - started,
    match_count: matches.length,
    matches,
    skipped: result.skipped || null,
  };
}

const SEMANTIC_SEARCH_RE =
  /\b(semantic search|vector search|search (the )?(store|site|docs|content|catalog)|find (in|from) (cms|products|docs)|what (does|do) (our|the) (site|store|page|product)|lookup|retriev(e|al))\b/i;

export function shouldRunSemanticSearch(message, routing = {}) {
  const hay = String(message || "");
  if (SEMANTIC_SEARCH_RE.test(hay)) return true;
  const toolKeys = (routing.tools || []).map((t) => t.tool_key);
  if (toolKeys.includes("fnf_semantic_search")) return true;
  if (/\b(product copy|page copy|brand voice|collection description|homepage copy)\b/i.test(hay)) {
    return true;
  }
  return false;
}

export async function maybeRunSemanticSearch(env, message, routing = {}) {
  if (!shouldRunSemanticSearch(message, routing)) return null;
  if (!getFnfVectorizeBinding(env)) return null;

  try {
    return await executeFnfSemanticSearch(env, { query: message, top_k: 6 });
  } catch (err) {
    console.error("fnf semantic search failed", err?.message || err);
    return { ok: false, error: err?.message || "semantic_search_failed" };
  }
}

export function formatSemanticSearchForPrompt(result) {
  if (!result?.ok || !result.matches?.length) return "";

  const lines = result.matches.map((m, i) => {
    const src = [m.source_type, m.source_key].filter(Boolean).join(":");
    const preview = m.text_preview || "";
    return `${i + 1}. [${src}] (score ${Number(m.score || 0).toFixed(3)})\n${preview}`;
  });

  return [
    "SEMANTIC SEARCH RESULTS (FNF_VECTORIZE — workspace ede6590ac0d2fb7daf155b35653457b2 only):",
    `Query: ${result.query}`,
    "",
    lines.join("\n\n"),
  ].join("\n");
}
