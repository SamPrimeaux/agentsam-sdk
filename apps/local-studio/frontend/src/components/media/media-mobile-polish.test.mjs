import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const base = new URL(".", import.meta.url);
const read = (path) => readFileSync(new URL(path, base), "utf8");

test("Mobile media controls preserve Upload and source wiring", () => {
  const source = read("MediaLibraryPage.tsx");
  assert.match(source, /className="agentsam-media-btn is-primary agentsam-media-add"/);
  assert.match(source, /source === "cf_images" \|\| source === "r2"/);
  assert.match(source, /fileUploadRef\.current\?\.click\(\)/);
  assert.match(source, /aria-label="Refresh media"/);
  assert.match(source, /setRefreshTick/);
  assert.match(source, /<BucketPicker/);
  assert.match(source, /<ConnectionStatus/);
  assert.match(source, /chooseSource\("local"\)/);
});
test("Mobile grid preserves selection, menus and real media previews", () => {
  const grid = read("MediaGrid.tsx");
  const style = read("media-library.css");
  assert.match(grid, /<MediaAssetMenu/);
  assert.match(grid, /onToggle\(asset\.id\)/);
  assert.match(grid, /previewUrl\(asset\)/);
  assert.match(grid, /agentsam-media-thumb__play/);
  assert.match(grid, /agentsam-media-thumb__duration/);
  assert.match(style, /-webkit-line-clamp: 2/);
  assert.match(style, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(style, /agentsam-media-tabs::-webkit-scrollbar/);
  assert.match(style, /agentsam-media-thumb\.is-video img \{ object-fit: cover/);
});
