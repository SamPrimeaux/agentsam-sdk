import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sideStage = read('../frontend/src/components/workbench/side-stage.tsx');
const pluginPicker = read('../frontend/agentsam/PluginPicker.tsx');
const canvasRoute = read('../frontend/src/routes/(apps)/admin/canvas.tsx');
const canvasStage = read('../frontend/src/components/workbench/canvas-entry-stage.tsx');
const shell = read('../frontend/agentsam/AgentSamShell.tsx');
const cmsHost = read('../frontend/src/routes/(apps)/admin/apps/ecommerce-cms-agentsam.tsx');
const mediaPage = read('../frontend/src/components/media/MediaLibraryPage.tsx');
const mediaViewer = read('../frontend/src/components/media/MediaViewer.tsx');
const mediaCss = read('../frontend/src/components/media/media-library.css');

test('persisted plugin tabs migrate to the current builtin renderer', () => {
  assert.match(sideStage, /convertSideTab/);
  assert.match(sideStage, /stage\?\.renderer !== "builtin"/);
  assert.match(sideStage, /nativeAlreadyOpen/);
  assert.match(sideStage, /pluginId: undefined/);
  assert.match(pluginPicker, /kind === "design" && !existing/);
  assert.match(pluginPicker, /url: "\/canvas\?library=sources"/);
  assert.match(sideStage, /candidate\.kind === kind/);
  assert.match(sideStage, /\/canvas\?library=sources/);
});

test('full-stage Canvas is the only mounted editor and reuses the current document', () => {
  assert.match(shell, /!isConversation && !isCanvasRoute && state\.sideOpen/);
  assert.match(shell, /data-assistant-focused=\{!isConversation && !isCanvasRoute/);
  assert.match(canvasRoute, /existing && !hasExplicitDocumentTarget/);
  assert.match(canvasRoute, /work\.setActiveSideTab\(existing\.id\)/);
  assert.match(canvasRoute, /openSources=\{search\.library === "sources"\}/);
  assert.match(canvasStage, /if\(openSources\)setShowSources\(true\)/);
});

test('legacy ecommerce-host Design Canvas links redirect to the native source library', () => {
  assert.match(cmsHost, /legacyDesignCanvas/);
  assert.match(cmsHost, /Navigate to="\/admin\/canvas" search=\{\{ library: "sources" \}\} replace/);
});

test('opening a media asset enters a full focused view and keeps the gallery mounted', () => {
  assert.match(mediaPage, /agentsam-media-library is-inspecting is-focused/);
  assert.match(mediaPage, /<MediaItems/);
  assert.match(mediaPage, /<MediaViewer/);
  assert.match(mediaViewer, /Back to media library/);
  assert.match(mediaCss, /\.agentsam-media-library\.is-focused \.agentsam-media-header/);
  assert.match(mediaCss, /\.agentsam-media-library\.is-focused \.agentsam-media-body/);
  assert.match(mediaCss, /\.agentsam-media-viewer \{[\s\S]*?inset: 0/);
  assert.match(mediaCss, /\.agentsam-media-viewer__body \{[\s\S]*?flex-direction: row/);
  assert.match(mediaCss, /\.agentsam-media-viewer__stage \{[\s\S]*?flex: 1 1 auto/);
});
