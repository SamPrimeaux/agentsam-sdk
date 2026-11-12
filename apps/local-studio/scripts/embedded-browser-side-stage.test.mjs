import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const browser = read('../frontend/src/components/workbench/browser.tsx');
const abs = read('../../../packages/agentsam-abs/src/react/AgentSamAbsBrowser.tsx');
const viewport = read('../frontend/src/components/workbench/embedded-browser-viewport.tsx');
const native = read('../../../packages/agentsam-desktop-shell/src-tauri/src/commands/embedded_browser.rs');
const main = read('../../../packages/agentsam-desktop-shell/src-tauri/src/main.rs');

test('the existing browser Side Stage consumes the shared ABS shell, without a dedicated new page', () => {
  assert.match(browser, /AgentSamAbsBrowser/);
  assert.match(browser, /useWorkStore/);
  assert.match(browser, /EmbeddedBrowserViewport/);
  assert.match(browser, /showBuildTabs=\{false\}/);
  assert.doesNotMatch(browser, /<iframe[^>]+src=\{tab\.url\}/);
});

test('ABS accepts a host-controlled native Explore surface without changing its public showcase fallback', () => {
  assert.match(abs, /exploreSurface\?: ReactNode/);
  assert.match(abs, /exploreUrl: controlledExploreUrl/);
  assert.match(abs, /exploreUrl && exploreSurface/);
  assert.match(abs, /exploreUrl \? \(/);
});

test('native browser has a stable per-session child viewport and restricted URL schemes', () => {
  assert.match(native, /window\s*\.add_child/);
  assert.match(native, /embedded_browser_resize/);
  assert.match(native, /embedded_browser_hide/);
  assert.match(native, /"http" \| "https"/);
  assert.match(native, /NewWindowResponse::Deny/);
  assert.match(main, /embedded_browser::embedded_browser_sync/);
  assert.match(main, /embedded_browser::embedded_browser_action/);
});

test('native viewport stays aligned with resized Side Stage and hides during dialogs', () => {
  assert.match(viewport, /ResizeObserver/);
  assert.match(viewport, /MutationObserver/);
  assert.match(viewport, /embedded_browser_hide/);
  assert.match(viewport, /embedded_browser_sync/);
  assert.match(viewport, /embedded_browser_resize/);
});

test('legacy /browse is a redirect, never a standalone browser workspace', () => {
  const route = read('../frontend/src/routes/(apps)/browse.tsx');
  const commands = read('../frontend/src/components/desktop/NativeCommandBridge.tsx');
  const home = read('../../ecommerce-cms-agentsam/frontend/static/home.html');
  const shell = read('../../ecommerce-cms-agentsam/frontend/shell.js');
  assert.match(route, /LegacyBrowserRedirect/);
  assert.match(route, /openBrowserSideStage\(\)/);
  assert.doesNotMatch(route, /<BrowserStage/);
  assert.match(commands, /"view\.open_browser": \(\) => \{[\s\S]*?openBrowserSideStage\(\)/);
  assert.match(home, /shellMode: document\.documentElement\.classList\.contains\('agentsam-embedded-home'\)/);
  assert.match(shell, /"embedded-home": \{ id: "embedded-home", hideAdminNav: true/);
});
