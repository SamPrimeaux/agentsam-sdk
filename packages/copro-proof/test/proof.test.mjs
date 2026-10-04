import test from "node:test";
import assert from "node:assert/strict";
import { runCoProVerticalProof } from "../src/index.js";

test("CoPro clean-room vertical proof composes the first package slice", () => {
  const result = runCoProVerticalProof();
  assert.equal(result.ok, true);
  assert.equal(result.mediaCount, 1);
  assert.equal(result.project.tracks[0].clips.length, 2);
  assert.equal(result.durationUs, 13_000_000);
  assert.equal(result.renderPlan.schema, "copro.render-plan.v1");
  assert.equal(result.backendId, "proof-renderer");

  const saved = JSON.stringify(result.project);
  assert.equal(/renderer|r2|cloudflareAccountId|streamUid/.test(saved), false);
});
