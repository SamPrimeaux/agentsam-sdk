import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

test("Media routes mount the existing MovieMode app, not the unrelated Content Studio", () => {
  assert.match(read("../frontend/src/routes/(apps)/media.tsx"), /MovieModeSurface/);
  assert.match(read("../frontend/src/routes/(apps)/media.tsx"), /media\/edit/);
  assert.match(read("../frontend/src/routes/(apps)/media.edit.tsx"), /createFileRoute\("\/\(apps\)\/media\/edit"\)/);
  assert.match(read("../frontend/src/routeTree.gen.ts"), /'\/media\/edit'/);
  assert.doesNotMatch(read("../frontend/src/routes/(apps)/media.tsx"), /ContentStudioPage|iframe|localhost/);
});

test("MovieMode remains one runnable application with a reusable Work host", () => {
  assert.match(read("../../agentsam-copro-studio/src/main.tsx"), /MovieModeApp standalone/);
  assert.match(read("../frontend/src/components/media/MovieModeSurface.tsx"), /lazy\(\(\)\s*=>/);
  assert.match(read("../frontend/src/components/media/MovieModeSurface.tsx"), /\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/agentsam-copro-studio/);
  assert.doesNotMatch(read("../frontend/src/components/media/MovieModeSurface.tsx"), /iframe|127\.0\.0\.1/);
});

test("Media replaces Utilities while Work exposes a focusable MovieMode tab", () => {
  const shell = read("../frontend/agentsam/AgentSamShell.tsx");
  assert.match(shell, /id: 'media', label: 'Media'/);
  assert.doesNotMatch(shell, /id: 'utilities'/);
  assert.match(read("../frontend/agentsam/side-stage-actions.ts"), /tab: 'media'/);
  assert.match(read("../frontend/src/components/workbench/side-stage.tsx"), /MovieModeSurface workPane/);
  assert.match(read("../frontend/agentsam/AgentSamPage.tsx"), /workFocused/);
  assert.match(read("../frontend/src/routes/(apps)/widgets.tsx"), /Navigate to="\/settings"/);
});

test("Full-height editors scroll within their Work container instead of viewport overflow", () => {
  const css = read("../frontend/src/components/media/moviemode-surface.css");
  assert.match(css, /\.agentsam-moviemode \.copro-projects \{/);
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /\.agentsam-moviemode \.copro-studio/);
  assert.match(css, /@container \(max-width: 820px\)/);
});

test("Local Studio bundles MovieMode from the active SDK worktree, not a linked checkout", () => {
  const vite = read("../vite.config.ts");
  assert.match(vite, /copro-ui\/src\/index\.ts/);
  assert.match(vite, /copro-ui\/styles\/copro\.css/);
  assert.match(vite, /replacement: coproUiSource/);
  assert.match(vite, /replacement: coproUiStyles/);
});

test("Embedded MovieMode does not render desktop home columns at narrow panel widths", () => {
  const host = read("../frontend/src/components/media/moviemode-surface.css");
  const editor = read("../../../packages/copro-ui/src/studio.tsx");
  assert.match(host, /is-work-pane \.mm-home-sidebar \{ display:none/);
  assert.match(host, /@container \(max-width: 760px\)/);
  assert.match(host, /mm-home-quick-grid \{ grid-template-columns:minmax\(0,1fr\)/);
  assert.match(editor, /data-handset=\{isHandset\}/);
  assert.match(editor, /setHandsetPanel\("browser"\)/);
});
