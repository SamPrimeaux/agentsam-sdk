import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(resolve(here, path), 'utf8');

test('focused Side Stage overrides the tablet and desktop split-width clamps', () => {
  const css = read('../frontend/src/components/workbench/work-layout.css');
  assert.match(css, /\.agentsam-workspace\.is-work-focused \.agentsam-side-panel\s*\{[^}]*max-width:\s*100%;/s);
});

test('new browser tab actions live in the global trailing header and offer full view', () => {
  const page = read('../frontend/agentsam/AgentSamPage.tsx');
  assert.match(page, /className="agentsam-topbar-browser-actions"/);
  assert.match(page, /New tab in full view/);
  assert.match(page, /openBrowserTab\(true\)/);
  assert.match(page, /createPortal\(headerActions, hostActionsSlot\)/);
  assert.match(page, /<AnnotationToggle\s*\/>/);
});

test('browser tabs take a real page title or URL host without a second tab registry', () => {
  const store = read('../frontend/src/lib/work/store.ts');
  const browser = read('../frontend/src/components/workbench/browser.tsx');
  const stage = read('../frontend/src/components/workbench/side-stage.tsx');
  assert.match(store, /title:\s*hostname\(url\)\s*\|\|\s*t\.title/);
  assert.match(browser, /title:\s*payload\.title!/);
  assert.match(stage, /title=\{item\.title\}>\{item\.title\}/);
  assert.doesNotMatch(stage, /rounded-full pl-2\.5/);
});

test('annotation button broadcasts active state and selection anchors to exact safe targets', () => {
  const host = read('../frontend/agentsam/AnnotationHelper.tsx');
  const helper = read('../../../packages/agentsam-workbench/src/agent/MiniAgentSam.tsx');
  assert.match(host, /aria-pressed=\{active\}/);
  assert.match(host, /agentsam:annotation-state/);
  assert.match(helper, /root\.addEventListener\('pointermove', move, true\)/);
  assert.match(helper, /target\.current = selected; setBounds\(selected\.getBoundingClientRect\(\)\)/);
  assert.match(helper, /text: editable \? '\[field value withheld\]'/);
});
