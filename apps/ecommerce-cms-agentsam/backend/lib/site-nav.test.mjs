import assert from "node:assert/strict";
import test from "node:test";
import { resolveNavConfig } from "./site-nav.js";

test("CMS navigation records are authoritative over legacy preference navItems", () => {
  const result = resolveNavConfig({
    homeTitle: "Example",
    navigationAuthority: "preferences",
    navItems: [{ label: "Legacy", href: "/legacy" }],
    cmsNavigationItems: [{ id: "cms-home", label: "Home", href: "/" }],
  });
  assert.deepEqual(result.items, [{ id: "cms-home", label: "Home", href: "/", matchPrefixes: ["/"] }]);
});

test("an intentionally empty active CMS menu stays empty instead of restoring defaults", () => {
  const result = resolveNavConfig({
    navItems: [{ label: "Legacy", href: "/legacy" }],
    cmsNavigationItems: [],
  });
  assert.deepEqual(result.items, []);
});

