import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Prevent a real public plugin catalog from silently disappearing on deploy.
// Operator-reviewed additional sources can be configured without editing Settings UI.
test("Local Studio Worker includes a trusted first-party plugin catalog", () => {
  const config = readFileSync(new URL("../backend/wrangler.jsonc", import.meta.url), "utf8");
  const setting = config.match(/"AGENTSAM_PLUGIN_CATALOG_URLS"\s*:\s*("(?:\\.|[^"\\])*")/);
  assert.ok(setting, "missing AGENTSAM_PLUGIN_CATALOG_URLS in deploy config");
  const sources = JSON.parse(JSON.parse(setting[1]));
  assert.ok(Array.isArray(sources) && sources.length > 0 && sources.length <= 8);
  assert.ok(sources.includes("https://agentsam-plugin-mcp.meauxbility.workers.dev/catalog/plugins"));
  for (const value of sources) {
    const url = new URL(value);
    assert.equal(url.protocol, "https:");
    assert.equal(url.pathname, "/catalog/plugins");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
});
