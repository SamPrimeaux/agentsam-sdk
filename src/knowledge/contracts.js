/** Provider-neutral AgentSam Knowledge SDK contracts and validators. */

import { normalizeResultPolicy } from '../context/result-policy.js';

export const KNOWLEDGE_OPERATIONS = Object.freeze({
  RETRIEVE: "knowledge.retrieve",
  INDEX: "knowledge.index",
});

export function assertRetrievalQuery(value) {
  if (!value || typeof value !== "object") throw new TypeError("RetrievalQuery must be an object");
  if (!String(value.text || "").trim()) throw new TypeError("RetrievalQuery.text is required");
  if (value.workspace_id != null && !String(value.workspace_id).trim()) throw new TypeError("RetrievalQuery.workspace_id must be non-empty when present");
  const resultPolicy = normalizeResultPolicy(value.result_policy || {});
  const topK = value.top_k ?? resultPolicy.max_items;
  if (!Number.isInteger(topK) || topK < 1 || topK > resultPolicy.max_items) throw new RangeError(`top_k must be 1..${resultPolicy.max_items} under the active result policy`);
  const defaultTokenBudget = Math.max(256, Math.floor(resultPolicy.max_chars / 4));
  const tokenBudget = value.token_budget ?? defaultTokenBudget;
  if (!Number.isInteger(tokenBudget) || tokenBudget < 256 || tokenBudget > defaultTokenBudget) throw new RangeError(`token_budget must be 256..${defaultTokenBudget} under the active result policy`);
  return { ...value, result_policy: resultPolicy, top_k: topK, token_budget: tokenBudget };
}

export function assertContextPack(value) {
  if (!value || typeof value !== "object") throw new TypeError("ContextPack must be an object");
  if (!String(value.query_id || "").trim()) throw new TypeError("ContextPack.query_id is required");
  if (!Array.isArray(value.hits)) throw new TypeError("ContextPack.hits must be an array");
  return value;
}
