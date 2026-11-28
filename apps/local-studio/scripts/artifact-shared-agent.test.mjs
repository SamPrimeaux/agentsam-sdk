import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('native Data creation stays in Side Stage and shares the existing conversation', () => {
  const launch = source('frontend/src/lib/work/artifact-launcher.ts');
  const side = source('frontend/src/components/workbench/side-stage.tsx');
  const stage = source('frontend/src/components/workbench/data-artifact-stage.tsx');
  const css = source('frontend/src/components/workbench/data-artifact-stage.css');
  assert.match(launch, /kind === "data"/);
  assert.match(launch, /openSideTab\("data"/);
  assert.doesNotMatch(launch, /data: "Start a new data artifact/);
  assert.match(side, /<DataArtifactStage tab=\{tab\}/);
  for (const format of ['dashboard', 'visual-analysis', 'scrollyteller', 'visual-short'])
    assert.ok(stage.includes(`id:'${format}'`));
  assert.match(stage, /stageChatFile\(file,user\.id\)/);
  assert.match(stage, /setPendingComposerAttachments/);
  assert.match(stage, /<AskAgentSamPill/);
  assert.doesNotMatch(stage, /<iframe/);
  assert.match(css, /@container \(max-width:740px\)/);
  assert.match(css, /prefers-reduced-motion:no-preference/);
});

test('phone shell reserves a dock band only when a dock is mounted', () => {
  const css = source('frontend/agentsam/shell.css');
  assert.match(css, /\.agentsam-shell \.agentsam-main\s*\{\s*padding-bottom: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(css, /\.agentsam-shell \.agentsam-main:has\(\.as-nav-launch-dock\)\s*\{\s*padding-bottom: calc\(62px \+ max\(9px, env\(safe-area-inset-bottom, 0px\)\)\);/);
});

test('Slides creation opens the existing creative editor and retains the active conversation', () => {
  const launch = source('frontend/src/lib/work/artifact-launcher.ts');
  assert.match(launch, /kind === "design" \|\| kind === "whiteboard" \|\| kind === "slides"/);
  assert.match(launch, /const chatId = work.activeChatId \|\| work.startChat\(\)/);
  assert.match(launch, /openSideTab\("design", \{/);
  assert.match(launch, /url: "\/canvas\?host=" \+ kind/);
  assert.doesNotMatch(launch, /slides: "Start a new presentation artifact/);
});

test('Docs and Canvas selections use the same scoped composer-context mechanism', () => {
  const helper = source('frontend/src/lib/work/artifact-assistance.ts');
  const docs = source('frontend/src/components/workbench/document-editor.tsx');
  const canvas = source('frontend/src/components/workbench/canvas-entry-stage.tsx');
  const stage = source('frontend/src/components/workbench/canvas/stage.tsx');
  const side = source('frontend/src/components/workbench/side-stage.tsx');
  const shell = source('shared/agentsam/src/work-types.ts');
  assert.match(helper, /setPendingAnnotations/);
  assert.match(helper, /\.agentsam-conversation-dock textarea/);
  assert.match(helper, /target\.chatId \|\| store\.activeChatId/);
  assert.match(docs, /askAgentSamAboutArtifact\(\{kind:'docs'/);
  assert.match(canvas, /askAgentSamAboutArtifact\(\{/);
  assert.match(canvas, /<AskAgentSamPill/);
  assert.match(stage, /"data-annotation-target"/);
  assert.match(side, /'design', 'data', 'files'/);
  assert.match(shell, /"design" \| "data"/);
});

test('portable Ask AgentSam pill is a callback only; no duplicate assistant or transport', () => {
  const pill = readFileSync(new URL('../../../packages/agentsam-workbench/src/agent/AskAgentSamPill.tsx', import.meta.url), 'utf8');
  const agent = readFileSync(new URL('../../../packages/agentsam-workbench/src/agent/index.ts', import.meta.url), 'utf8');
  const design = readFileSync(new URL('../../../packages/agentsam-contracts/src/design-workspace.ts', import.meta.url), 'utf8');
  assert.match(pill, /<button type="button"/);
  assert.match(pill, /onClick=\{onAsk\}/);
  assert.match(pill, /Ask AgentSam/);
  assert.doesNotMatch(pill, /fetch\(|postMessage|setDraft/);
  assert.match(agent, /AskAgentSamPill/);
  for (const kind of ['slides','whiteboard','doc','data','sheets'])
    assert.ok(design.includes(`| "${kind}"`));
  assert.match(design, /point\?: \{ x: number; y: number \}/);
});

test('artifact layouts use one filter state, and Slides use the existing lead composer', () => {
  const gallery = readFileSync(new URL('../../../packages/agentsam-work/src/frontend/surfaces/ArtifactsSurface.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../../packages/agentsam-work/src/frontend/theme.css', import.meta.url), 'utf8');
  const page = source('frontend/agentsam/AgentSamPage.tsx');
  const composer = source('frontend/src/components/workbench/composer.tsx');
  assert.ok(gallery.includes('aria-label="Artifact layout"'));
  assert.ok(gallery.includes('agentsam.artifacts.layout'));
  assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(css.includes('grid-template-columns:minmax(100px,38%) minmax(0,1fr)'));
  assert.ok(page.includes('artifactContext={isMobile ? slidesContext : undefined}'));
  assert.ok(composer.includes('Ask about these slides'));
  assert.ok(composer.includes("'artifact:slides:' + artifactContext.id"));
  assert.ok(composer.includes('setPendingAnnotations(targetId'));
});

test('phone geometry shares a compact header and accounts for the safe area once', () => {
  const shell = source('frontend/agentsam/shell.css');
  const host = source('frontend/agentsam/shared-nav-host.css');
  const store = source('frontend/src/components/store/OnlineStorePage.tsx');
  assert.match(shell, /\.platform-console-topbar:has\(\.agentsam-mobile-companion-identity\)\s*\{\s*height:56px; min-height:56px;/);
  assert.match(host, /--c-topbar-h:calc\(56px \+ env\(safe-area-inset-top,0px\)\)/);
  assert.match(host, /data-mobile-header-state="start"\]\) \.console-topbar-center\s*\{\s*top:calc\(50% \+ env\(safe-area-inset-top,0px\) \/ 2\)!important/);
  assert.match(host, /agentsam-native-store-route \.console-body\s*\{\s*box-sizing:border-box; padding-top:env\(safe-area-inset-top,0px\)/);
  assert.match(host, /\/\* A zero transform still creates a containing block for fixed docks\. \*\/\s*transform: none;/);
  assert.match(shell, /aria-label="Merchant navigation"\]\)\s*\{\s*padding-bottom: calc\(66px \+ max\(9px, env\(safe-area-inset-bottom, 0px\)\)\);/);
  assert.doesNotMatch(store, /gap-6 px-3 pt-4 pb-28/);
});
