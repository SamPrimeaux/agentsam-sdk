import assert from "node:assert/strict";
import test from "node:test";
import { createAppRegistry } from "./app-registry.js";

const manifests = [
  {
    id: "cad-creator",
    screens: [
      { id: "cad-creator.workspace", route: "/admin/cad", module: "routes/cad.tsx" },
      { id: "cad-creator.assets", route: "/admin/cad/assets", module: "routes/cad-assets.tsx" },
    ],
    routes: { mounts: [{ path: "/cad", shell: "dist/index.html" }] },
  },
  { id: "movie-mode", screens: [{ id: "movie-mode.editor", route: "/admin/moviemode" }] },
];

test("legacy mount resolution remains available", () => {
  const registry = createAppRegistry(manifests);
  assert.equal(registry.resolvePath("/cad/projects/1")?.app.id, "cad-creator");
});

test("screen routes resolve by longest prefix and require the installed screen binding", () => {
  const registry = createAppRegistry(manifests);
  const installed = [
    { key: "cad-creator", installed: true, enabled: true, screens: [{ id: "cad-creator.workspace" }, { id: "cad-creator.assets" }] },
    { key: "movie-mode", installed: true, enabled: false, screens: [{ id: "movie-mode.editor" }] },
  ];
  assert.equal(registry.resolveScreenPath("/admin/cad/assets/123", installed)?.screen.id, "cad-creator.assets");
  assert.equal(registry.resolveScreenPath("/admin/moviemode", installed), null);
  assert.equal(registry.resolveScreenPath("/admin/cad", [{ ...installed[0], screens: [{ id: "cad-creator.assets" }] }]), null);
  assert.equal(registry.resolveScreen("cad-creator", "cad-creator.workspace", installed)?.screen.route, "/admin/cad");
  assert.equal(registry.resolveScreen("cad-creator", "unknown", installed), null);
});

test("uninstalled catalog screens do not become account routes", () => {
  const registry = createAppRegistry(manifests);
  assert.equal(registry.resolveScreenPath("/admin/cad", []), null);
});


test("screen ownership may be declared by a host manifest but installed under the app catalog ID", () => {
  const registry = createAppRegistry([
    {
      id: "agentsam-copro-studio",
      screens: [{ id: "moviemode.editor", app_id: "moviemode", route: "/admin/moviemode" }],
    },
    {
      id: "local-studio",
      screens: [{ id: "local-studio.chat", app_id: "local-studio", route: "/admin/agentsam", host_core: true, installation_required: false }],
    },
  ]);
  const installed = [{ key: "moviemode", installed: true, enabled: true, screens: [{ id: "moviemode.editor" }] }];
  assert.equal(registry.resolveScreenPath("/admin/moviemode/scene/1?tab=timeline", installed)?.screen.id, "moviemode.editor");
  assert.equal(registry.resolveScreen("agentsam-copro-studio", "moviemode.editor", installed)?.installation.key, "moviemode");
  assert.equal(registry.resolveScreenPath("/admin/agentsam", [])?.screen.id, "local-studio.chat");
});
