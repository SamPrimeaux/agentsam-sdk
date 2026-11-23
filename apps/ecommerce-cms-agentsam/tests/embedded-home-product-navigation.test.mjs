import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Storefront Home adapts its content to a narrow host container rather than screen width', () => {
  const css = read('../frontend/static/css/home-workspace.css');
  assert.match(css, /\.fnf-home\s*\{[^}]*container-type:\s*inline-size/s);
  assert.match(css, /@container\s*\(max-width:\s*620px\)/);
  assert.match(css, /@container\s*\(max-width:\s*390px\)/);
  assert.match(css, /\.fnf-home-shortcuts__grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/);
});

test('Embedded Ecommerce admin shell remains single while direct routes keep standalone navigation', () => {
  const shell = read('../frontend/shell.js');
  assert.match(shell, /window\.frameElement\?\.closest\('\[data-agentsam-installed-app\]'\)/);
  assert.match(shell, /framed\s*&&\s*\(explicitlyEmbedded\s*\|\|\s*installedAppHost\)/);
  assert.match(shell, /"embedded-app":\s*\{[^}]*hideAdminNav:\s*true/);
  assert.match(shell, /return framed && \(explicitlyEmbedded \|\| installedAppHost\)/);
});

test('Product Studio uses the published packaged dock with the real editor tabs, not another tool router', () => {
  const workspace = read('../frontend/src/pages/products/StudioWorkspace.tsx');
  const styles = read('../frontend/src/styles/product-studio.css');
  const pkg = JSON.parse(read('../frontend/package.json'));
  assert.equal(pkg.dependencies['@inneranimalmedia/agentsam-nav'], '2.6.17');
  assert.match(workspace, /import\s*\{\s*NavLaunchDock\s*\}\s*from\s*"@inneranimalmedia\/agentsam-nav"/);
  for (const id of ['options', 'upload', 'designs', 'layers', 'tools'])
    assert.match(workspace, new RegExp('id: "' + id + '"'));
  assert.match(workspace, /<NavLaunchDock\s+items=\{tabs\.map/);
  assert.match(workspace, /onSelect:\s*\(\)\s*=>\s*openTab\(t\.id\)/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*\.ps-toolrail\s*\{\s*display:none/);
  assert.match(styles, /\.ps-studio-launch-dock\s+\.as-nav-launch-dock\s*\{/);
  assert.match(styles, /\.ps-toolpanel:not\(\[hidden\]\)\s*\{[^}]*bottom:\s*calc\(80px/s);
  assert.match(styles, /\.product-studio-shell:has\(input:focus,textarea:focus,select:focus/);
  // The mobile dock replaces the rail, not its existing help destination.
  assert.match(workspace, /className="ps-toolpanel-mobile-help" href="\/admin\/products\/help\/artwork"/);
  assert.match(styles, /\.ps-toolpanel-mobile-help\s*\{[^}]*display:inline-flex/);
});
