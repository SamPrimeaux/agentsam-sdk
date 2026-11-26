import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('mini composer exposes compact, focused, expandable review chrome', async () => {
  const source = await readFile(new URL('../src/agent/MiniAgentSam.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent/mini-agentsam.css', import.meta.url), 'utf8');
  const host = await readFile(
    new URL('../../../apps/local-studio/frontend/agentsam/AnnotationHelper.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /onDoubleClick=/);
  assert.match(source, /pointerType !== 'touch'/);
  assert.match(source, /data-expanded={expanded/);
  assert.ok(source.includes("querySelector('textarea')"));

  assert.match(host, /containerClassName="mini-agentsam-composer"/);
  assert.match(host, /inputClassName="mini-agentsam-input"/);
  assert.match(host, /<ArrowUp/);
  assert.match(host, /data-composer-send=""/);

  assert.match(css, /\.mini-agentsam-composer:focus-within/);
  assert.match(css, /0 0 0 4px/);
  assert.match(css, /\.mini-agentsam-panel\[data-expanded="true"\] \.mini-agentsam-input/);
  assert.match(css, /max-height: min\(58dvh, 560px\)/);
  assert.match(css, /\.mini-agentsam-send svg[\s\S]*transform: none/);
});

test('miniAgentSam preserves host resource identity and specialist handoff context', async () => {
  const mini = await readFile(new URL('../src/agent/MiniAgentSam.tsx', import.meta.url), 'utf8');
  const selection = await readFile(new URL('../src/agent/annotation-selection.ts', import.meta.url), 'utf8');
  const host = await readFile(new URL('../../../apps/local-studio/frontend/agentsam/AnnotationHelper.tsx', import.meta.url), 'utf8');
  const canvas = await readFile(new URL('../../../apps/local-studio/frontend/src/components/workbench/canvas-entry-stage.tsx', import.meta.url), 'utf8');
  const stage = await readFile(new URL('../../../apps/local-studio/frontend/src/components/workbench/canvas/stage.tsx', import.meta.url), 'utf8');
  const sideStage = await readFile(new URL('../../../apps/local-studio/frontend/src/components/workbench/side-stage.tsx', import.meta.url), 'utf8');
  const canvasCss = await readFile(new URL('../../../apps/local-studio/frontend/src/components/workbench/canvas/canvas.css', import.meta.url), 'utf8');

  assert.match(mini, /data-agentsam-resource-host/);
  assert.match(mini, /readHostResource\(selected\)/);
  assert.match(mini, /readHostResource\(frame\)/);
  assert.match(mini, /iframe\.cv-native-html/);
  assert.match(host, /agentsam:design-workspace-prompt/);
  assert.match(host, /Selected \$\{selection\.tag\}: \$\{selection\.id\}/);
  assert.match(selection, /data-agentsam-annotation-scope/);
  assert.match(host, /resolveAnnotationScope\(document, scopeId\)/);
  assert.match(sideStage, /data-agentsam-annotation-scope/);
  assert.match(stage, /data-agentsam-resource-kind="design-canvas"/);
  assert.match(stage, /data-agentsam-resource-revision=\{revision\}/);
  assert.match(stage, /withBrowserAnnotationBridge/);
  assert.match(host, /DESIGN_WORKSPACE_PROMPT_EVENT/);
  assert.match(canvas, /DESIGN_WORKSPACE_PROMPT_EVENT/);
  assert.match(canvas, /startRunRef\.current/);
  assert.doesNotMatch(canvas, /cv-assistant-body|cv-mini-assistant|assistantMode|<Composer targetId=/);
  assert.doesNotMatch(canvasCss, /cv-assistant-body|cv-mini-assistant|cv-assistant-modes|cv-expanded-assistant/);
  assert.match(canvas, /<AnnotationToggle scopeId=\"design-canvas\" className=\"cv-icon-button\"\/>/);
  assert.match(stage, /data-annotation-proxy/);
  assert.match(stage, /data-annotation-control/);
  assert.doesNotMatch(mini, /scope\?\.\(\) \|\| document\.body/);
  assert.match(mini, /resolveAnnotationTarget\(event\.target, root\)/);
  assert.match(sideStage, /data-annotation-scope-id=\"side-stage\"/);
});

test('Local Studio brand uses the canonical packaged desktop icon', async () => {
  const brand = await readFile(
    new URL('../../../apps/local-studio/frontend/agentsam/brand.ts', import.meta.url),
    'utf8',
  );
  const canonicalIcon = await readFile(
    new URL('../../../packages/agentsam-desktop-shell/icons/local-studio/icon.png', import.meta.url),
  );
  const packagedIcon = await readFile(
    new URL('../../../apps/local-studio/frontend/public/brand/agentsam-local-studio-icon.png', import.meta.url),
  );
  assert.match(brand, /logo:\s*['"]\/brand\/agentsam-gorilla\/v1\/pet\/ledge\/ledge-idle\.svg['"]/);
  assert.match(brand, /lightLogo:\s*['"]\/brand\/agentsam-gorilla\/v1\/pet\/ledge\/ledge-idle\.svg['"]/);
  assert.deepEqual(packagedIcon, canonicalIcon);
  assert.doesNotMatch(brand, /imagedelivery|https?:\/\//);
});

test('miniAgentSam pins actual selection points and derives its appearance from theme tokens', async () => {
  const source = await readFile(new URL('../src/agent/MiniAgentSam.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent/mini-agentsam.css', import.meta.url), 'utf8');
  assert.match(source, /className="mini-agentsam-pin"/);
  assert.match(source, /className="mini-agentsam-suggestions"/);
  assert.match(source, /cadContext\.current/);
  assert.match(source, /previousPointerEvents/);
  assert.match(source, /isAnnotationVisualTarget\(selected, root\)/);
  assert.match(source, /visual,?/);
  assert.match(css, /cv-native-html/);
  assert.match(css, /\.mini-agentsam-attachment-previews/);
  assert.match(css, /--mini-accent: var\(--nav-accent/);
});
