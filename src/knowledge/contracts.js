/** Provider-neutral AgentSam Knowledge SDK contracts and validators. */

export const KNOWLEDGE_OPERATIONS = Object.freeze({
  RETRIEVE: "knowledge.retrieve",
  INDEX: "knowledge.index",
});

export function assertRetrievalQuery(value) {
  if (!value || typeof value !== "object") throw new TypeError("RetrievalQuery must be an object");
  if (!String(value.text || "").trim()) throw new TypeError("RetrievalQuery.text is required");
  if (!String(value.workspace_id || "").trim()) throw new TypeError("RetrievalQuery.workspace_id is required");
  const topK = value.top_k ?? 12;
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new RangeError("top_k must be 1..100");
  if (!Number.isInteger(value.token_budget ?? 8000) || (value.token_budget ?? 8000) < 256) throw new RangeError("token_budget must be at least 256");
  return { ...value, top_k: topK, token_budget: value.token_budget ?? 8000 };
}

export function assertContextPack(value) {
  if (!value || typeof value !== "object") throw new TypeError("ContextPack must be an object");
  if (!String(value.query_id || "").trim()) throw new TypeError("ContextPack.query_id is required");
  if (!Array.isArray(value.hits)) throw new TypeError("ContextPack.hits must be an array");
  return value;
}
