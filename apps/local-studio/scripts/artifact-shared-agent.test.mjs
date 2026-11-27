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
  assert.match(css, /\.agentsam-shell \.agentsam-main:has\(\.as-nav-launch-dock\)\s*\{\s*padding-bottom: calc\(77px \+ env\(safe-area-inset-bottom, 0px\)\);/);
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
