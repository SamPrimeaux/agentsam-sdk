import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const sourceUrl = new URL("./api.js", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");

function extractMatcher(variable) {
  const lines = source.split("\n").filter(line => line.includes("const " + variable + " = path.match("));
  assert.equal(lines.length, 1, "route matcher must occur exactly once");
  const expression = lines[0].trim().replace(/^const \w+ = /, "").replace(/;$/, "");
  return vm.runInNewContext("(path) => " + expression);
}

test("CMS API parses as valid JavaScript", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)], { stdio: "pipe" }));
});

test("theme project routes match only canonical project paths", () => {
  const match = extractMatcher("themeProjectMatch");
  assert.equal(match("/api/admin/cms/theme-projects/theme_resolve")?.[1], "theme_resolve");
  assert.equal(match("/api/admin/cms/theme-projects/abc-123")?.[1], "abc-123");
  for (const path of ["/api/admin/cms/theme-projects", "/api/admin/cms/theme-projects/../other",
    "/api/admin/cms/theme-projects/invalid/name", "/api/admin/cms/themes/resolve/install"]) {
    assert.equal(match(path), null, path);
  }
});

test("theme install route matches only canonical package slugs", () => {
  const match = extractMatcher("themeInstallMatch");
  assert.equal(match("/api/admin/cms/themes/resolve/install")?.[1], "resolve");
  assert.equal(match("/api/admin/cms/themes/plain-jane/install")?.[1], "plain-jane");
  for (const path of ["/api/admin/cms/themes/install", "/api/admin/cms/themes/../install",
    "/api/admin/cms/theme-projects/theme_resolve", "/api/admin/cms/themes/Bad/install"]) {
    assert.equal(match(path), null, path);
  }
});
