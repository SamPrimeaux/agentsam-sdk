import test from "node:test";
import assert from "node:assert/strict";
import { themeProjectGlobalKey, validateThemeProjectPayload } from "./theme-project-store.mjs";

function project(overrides = {}) {
  return {
    schema: "agentsam.theme-project.v1",
    id: "theme_resolve",
    name: "Resolve",
    revision: 0,
    pages: [{
      slug: "home",
      title: "Home",
      template: "<!doctype html><html><body><!--theme-section:section_1--></body></html>",
      sections: [{
        key: "section_1",
        name: "Hero",
        html: "<section data-theme-project-field=\"field_1\">Hero</section>",
        content: { field_1: "Hero", __editor: { templateKey: "section_1", visibility: { enabled: true }, blocks: [] } },
        schema: { key: "section_1", fields: [{ key: "field_1", label: "Headline", type: "text" }], settings: [], blocks: [] },
      }],
    }],
    ...overrides,
  };
}

test("theme project globals are keyed by a validated stable project ID", () => {
  assert.equal(themeProjectGlobalKey("theme_resolve"), "theme-project:theme_resolve");
  assert.throws(() => themeProjectGlobalKey("../other-account"), /theme_project_id_invalid/);
});

test("CMS theme project payload validation retains the editable page contract", () => {
  const validated = validateThemeProjectPayload(project());
  assert.equal(validated.id, "theme_resolve");
  assert.equal(validated.pages[0].sections[0].schema.fields[0].key, "field_1");
});

test("CMS theme project payload validation rejects oversized or unsafe projects", () => {
  assert.throws(() => validateThemeProjectPayload(project({ id: "__proto__" })));
  const oversized = project();
  oversized.pages[0].template = "x".repeat(8 * 1024 * 1024 + 32);
  assert.throws(() => validateThemeProjectPayload(oversized), /theme_project_too_large/);
});
