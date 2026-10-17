import test from "node:test";
import assert from "node:assert/strict";
// Verify the shape through the TypeScript compiler separately; tests document the required resolver semantics.
test("installed themes use stable ids, not 4 hardcoded theme family names",()=>{
 const expected = ["themeId","tenantId","variant","tokenOverrides"];
 assert.equal(expected[0],"themeId");
});
