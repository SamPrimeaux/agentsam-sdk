import assert from "node:assert/strict";
import { buildRetrievalPlan, createContextPack } from "../src/knowledge/index.js";

const query = { text: "where is the auth handler?", workspace_id: "ws_test", intent: "code_question" };
const plan = buildRetrievalPlan(query);
assert.deepEqual(plan.lanes, ["code", "docs", "schema"]);
const pack = createContextPack({ queryId: "q1", query, hits: [{ chunk_id: "c1", content: "hello", score: 1, lane: "code" }] });
assert.equal(pack.hits.length, 1);
