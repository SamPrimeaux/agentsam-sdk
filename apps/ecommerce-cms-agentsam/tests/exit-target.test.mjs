import test from "node:test";
import assert from "node:assert/strict";
import { resolveExitTarget } from "../frontend/static/js/exit-target.mjs";

const hostile = [
  "//evil.com",
  "/\\evil.com",
  "https://x",
  "javascript:alert(1)",
  "/admin/../x",
  "/admin/theme-editor",
  "/admin/theme-editor/foo",
  "%2f%2fevil.com",
  "/admin/%2e%2e/x",
  "/admin/store/%2e%2e/%2e%2e/etc",
  "https://evil.com/admin/store",
];

test("hostile exit targets fall back to /admin/store", () => {
  for (const input of hostile) {
    assert.equal(resolveExitTarget(input), "/admin/store", input);
    assert.equal(resolveExitTarget(null, input), "/admin/store", input);
  }
});

test("allowlisted admin path is kept and query is stripped", () => {
  assert.equal(resolveExitTarget("/admin/pages?next=//evil.com"), "/admin/pages");
  assert.equal(resolveExitTarget("" , "/admin/home"), "/admin/home");
});
