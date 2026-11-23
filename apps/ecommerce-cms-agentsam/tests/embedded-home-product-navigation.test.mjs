import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('AgentSam leading controls reserve the hamburger hit target', () => {
  const css = read('../../local-studio/frontend/agentsam/shell.css');
  assert.match(css, /#agentsam-console-leading-slot:not\(:empty\)[^}]+--agentsam-leading-clearance/s);
  assert.match(css, /--agentsam-leading-clearance:\s*50px/);
});

test('Home iframe actually shrinks with Side Stage and its content responds to available width', () => {
  const host = read('../../local-studio/frontend/agentsam/platform-console.css');
  const home = read('../frontend/static/css/home-workspace.css');
  assert.match(host, /\.platform-console-stage\s*>\s*\.agentsam-route\s*\{[^}]*flex:\s*1\s+1\s+0%/s);
  assert.match(host, /\.agentsam-route\s*>\s*iframe\s*\{[^}]*width:\s*100%/s);
  assert.match(home, /\.fnf-home\s*\{[^}]*container-type:\s*inline-size/s);
  assert.match(home, /@container\s*\(max-width:\s*620px\)/);
  assert.match(home, /@container\s*\(max-width:\s*390px\)/);
  assert.match(home, /\.fnf-home-shortcuts__grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/);
});

test('Packaged Ecommerce shell hides duplicate global navigation only in a proven installed-app frame', () => {
  const shell = read('../frontend/shell.js');
  const host = read('../../local-studio/frontend/src/routes/(apps)/admin/apps/ecommerce-cms-agentsam.tsx');
  assert.match(shell, /window\.frameElement\?\.closest\('\[data-agentsam-installed-app\]'\)/);
  assert.match(shell, /framed\s*&&\s*\(explicitlyEmbedded\s*\|\|\s*installedAppHost\)/);
  assert.match(shell, /"embedded-app":\s*\{[^}]*hideAdminNav:\s*true/);
  assert.match(host, /resolved\.searchParams\.set\('__agentsamEmbedded',\s*'1'\)/);
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
});
