export function createContextPack({ queryId, query, hits = [], diagnostics = {}, confidence = "unknown" }) {
  const normalizedHits = hits.map((hit) => Object.freeze({ stale: false, reasons: [], metadata: {}, ...hit }));
  const estimatedTokens = estimateTokens(normalizedHits);
  const chars = normalizedHits.reduce((sum, hit) => sum + String(hit.content || "").length, 0);
  const considered = Number.isInteger(diagnostics.sources_considered) ? diagnostics.sources_considered : normalizedHits.length;
  const deferred = Number.isInteger(diagnostics.sources_deferred) ? diagnostics.sources_deferred : Math.max(0, considered - normalizedHits.length);
  return Object.freeze({
    query_id: queryId,
    query,
    hits: normalizedHits,
    estimated_tokens: estimatedTokens,
    confidence,
    diagnostics: Object.freeze({ ...diagnostics }),
    receipt: Object.freeze({
      chars,
      estimated_tokens: estimatedTokens,
      sources_considered: considered,
      sources_included: normalizedHits.length,
      sources_deferred: deferred,
    }),
  });
}

export function estimateTokens(hits) {
  return hits.reduce((sum, hit) => sum + Math.ceil(String(hit.content || "").length / 4), 0);
}
