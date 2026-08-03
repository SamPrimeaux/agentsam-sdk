export function createContextPack({ queryId, query, hits = [], diagnostics = {}, confidence = "unknown" }) {
  const normalizedHits = hits.map((hit) => Object.freeze({ stale: false, reasons: [], metadata: {}, ...hit }));
  return Object.freeze({
    query_id: queryId,
    query,
    hits: normalizedHits,
    estimated_tokens: estimateTokens(normalizedHits),
    confidence,
    diagnostics: Object.freeze({ ...diagnostics }),
  });
}

export function estimateTokens(hits) {
  return hits.reduce((sum, hit) => sum + Math.ceil(String(hit.content || "").length / 4), 0);
}
