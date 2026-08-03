import { assertRetrievalQuery } from "./contracts.js";

export function buildRetrievalPlan(query) {
  const normalized = assertRetrievalQuery(query);
  const lanes = normalized.lanes?.length ? [...normalized.lanes] : inferLanes(normalized.intent, normalized.text);
  return Object.freeze({
    query: normalized,
    lanes,
    candidate_limit: Math.min(250, Math.max(normalized.top_k * 8, 40)),
    rerank: true,
    diversify: true,
  });
}

function inferLanes(intent = "auto", text = "") {
  if (intent === "code_question" || /\b(function|class|symbol|handler|import|repo|code)\b/i.test(text)) {
    return ["code", "docs", "schema"];
  }
  return ["docs", "memory", "archive"];
}
