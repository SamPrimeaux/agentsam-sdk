import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Library presents Work artifacts and Cloudflare media through one shared route UI', () => {
  const library = read('../frontend/src/components/media/UnifiedLibraryPage.tsx');
  const libraryRoute = read('../frontend/src/routes/(apps)/admin/library.tsx');
  const media = read('../frontend/src/routes/(apps)/admin/media.tsx');
  const nav = read('../frontend/src/components/shell/nav-rail.tsx');
  assert.match(library, /export function UnifiedLibraryPage/);
  assert.match(libraryRoute, /<UnifiedLibraryPage view="artifacts" \/>/);
  assert.match(library, /LocalStudioWorkPage surface="artifacts"/);
  assert.match(library, /<MediaLibraryPage \/>/);
  assert.match(library, /navigate\(\{ to: '\/admin\/media' \}\)/);
  assert.match(library, /navigate\(\{ to: '\/admin\/library' \}\)/);
  assert.match(media, /<UnifiedLibraryPage view="media" \/>/);
  assert.match(media, /: <Outlet \/>/, 'nested media routes are still mounted by their owner');
  assert.match(nav, /to: "\/admin\/library", label: "Library"/);
  assert.doesNotMatch(nav, /label: "Artifacts"/, 'artifacts are a section rather than a second navigation destination');
});

test('Library media actions are reachable without a permanent provider toolbar', () => {
  const page = read('../frontend/src/components/media/MediaLibraryPage.tsx');
  const menu = read('../frontend/src/components/media/MediaAssetMenu.tsx');
  const grid = read('../frontend/src/components/media/MediaGrid.tsx');
  assert.match(page, /className="agentsam-media-options"/);
  assert.match(page, /aria-label="Library options"/);
  assert.match(page, /<ConnectionStatus/);
  assert.match(page, /Cloudflare account/);
  assert.match(page, /Open MovieMode/);
  assert.match(page, /className="agentsam-media-options__view"/);
  assert.match(page, /aria-label="Mobile layout"/);
  assert.match(page, /aria-label="Mobile media sort"/);
  const style = read('../frontend/src/components/media/media-library.css');
  assert.match(style, /\.agentsam-media-toolbar > \.agentsam-media-sort,/);
  assert.match(menu, /Select item/);
  assert.match(menu, /onSelectItem: \(asset: MediaAsset\) => void/);
  assert.match(grid, /onSelectItem=\{\(item\) => onToggle\(item.id\)\}/);
});

test('Installed iOS PWA topbar reserves safe area once and gallery owns its scroll', () => {
  const host = read('../frontend/agentsam/packaged-console-frame.css');
  const media = read('../frontend/src/components/media/media-library.css');
  const layout = read('../frontend/src/components/media/library-layout.css');
  assert.match(host, /\(display-mode: standalone\)/);
  assert.match(host, /--c-topbar-h: calc\(56px \+ env\(safe-area-inset-top/);
  assert.match(host, /padding-top: env\(safe-area-inset-top/);
  assert.match(media, /calc\(1\.25rem \+ env\(safe-area-inset-bottom/);
  assert.match(layout, /\[data-library-view="media"\] \.agentsam-library-content \{ overflow: hidden;/);
});
