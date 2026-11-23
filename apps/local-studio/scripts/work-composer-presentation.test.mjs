import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPOSER_GROUPS } from '../../../packages/agentsam-workbench/src/agent/capability-catalog.ts';
import { resolveComposerPopoverLayout } from '../frontend/agentsam/composer-popover-layout.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const page = read('frontend/agentsam/AgentSamPage.tsx');
const picker = read('frontend/agentsam/PluginPicker.tsx');
const composer = read('frontend/src/components/workbench/composer.tsx');
const styles = read('frontend/agentsam/shell.css');

test('Work greeting renders the selected companion inline beside the prompt', () => {
  assert.match(page, /const companionArt = companionStateAsset\(companion/);
  assert.match(page, /<img src=\{companionArt\} alt="" draggable=\{false\}/);
  assert.match(page, /<h1>What should we work on\?<\/h1>/);
  assert.doesNotMatch(page, /agentsam-work-welcome-eyebrow/);
  assert.match(styles, /\.agentsam-work-welcome-art \{[^}]*width: 30px; height: 38px;[^}]*border: 0;[^}]*background: transparent;/s);
  assert.match(styles, /transform: translateY\(-5px\) scale\(2\)/);
  assert.match(styles, /align-items: flex-start/);
  assert.doesNotMatch(styles, /\.agentsam-work-welcome-art \{[^}]*width: clamp\(112px/);
});

test('plugins and connected services are available from the plus/@ menu, not persistent chips', () => {
  assert.match(picker, /label="Add tools and plugins"/);
  assert.match(picker, /<Plus size=\{19\}\/>/);
  assert.match(picker, /aria-haspopup="dialog"/);
  assert.match(picker, /const match=mentionFromComposer \? value\.slice\(0,cursor\)\.match\(\/\(\?:\^\|\\s\)@/);
  assert.match(picker, /className="agentsam-plugin-menu"/);
  assert.match(picker, /entry\.label/);
  assert.match(picker, /entry\.description\|\|entry\.status/);
  assert.doesNotMatch(picker, /COMPOSER_GROUPS\.map/);
  assert.equal(COMPOSER_GROUPS[0].kind, 'mcp');
  assert.equal(COMPOSER_GROUPS[1].kind, 'connection');
  assert.doesNotMatch(picker, /agentsam-plugin-previews/);
  assert.doesNotMatch(styles, /agentsam-plugin-previews/);
  assert.match(picker, /--agentsam-plugin-menu-max-height.*menuMaxHeight/);
  assert.match(picker, /resolveComposerPopoverLayout/);
  assert.match(picker, /visualViewport\?\.addEventListener\('resize', updatePlacement\)/);
  assert.match(picker, /title="Plugins and tools"/);
  assert.match(picker, /match \? match\[1\] : query/);
  assert.match(picker, /className="agentsam-plugin-results" role="listbox"/);
  assert.match(styles, /max-block-size: var\(--agentsam-plugin-menu-max-height, 0px\)/);
  assert.match(styles, /\.agentsam-plugin-menu\[data-section="mention"\] \.agentsam-plugin-results/);
  assert.doesNotMatch(styles, /max-height:min\(530px,62dvh\)/);
  assert.match(styles, /\.agentsam-conversation-dock \.agentsam-plugin-menu \{ top: auto; bottom: calc\(100% \+ \.5rem\); \}/);
  assert.match(styles, /\.agentsam-plugin-row \{[^}]*min-height: 44px/);
});

test('file and image attachments use compact neutral cards above the draft', () => {
  assert.match(composer, /className="flex max-h-\[376px\] flex-wrap items-start gap-3 overflow-y-auto/);
  assert.match(composer, /h-\[66px\] max-w-56/);
  assert.match(composer, /size-12 shrink-0 overflow-hidden rounded-md/);
  assert.doesNotMatch(composer, /absolute inset-x-0 bottom-0 truncate bg-black/);
  assert.match(composer, /attachmentPreview=\{attachmentPreview\}/);
  assert.match(composer, /stageChatFile\(file, user\?\.id/);
  assert.match(styles, /\.agentsam-composer-surface \.agentsam-composer-attachments \{ display: flex; width: 100%;/);
  assert.match(styles, /\.agentsam-composer-surface:has\(\.agentsam-composer-attachments\) \{\s*flex-direction: column/s);
  assert.match(composer, /<ProjectPicker chatId=\{targetId\} showTrigger=\{false\} \/>/);
  assert.doesNotMatch(composer, /as-work-composer-under/);
});

test('picker placement respects visual viewport including software keyboard', () => {
  const normal = resolveComposerPopoverLayout({
    anchorTop: 600, anchorBottom: 675, visibleTop: 0, visibleBottom: 844,
  });
  assert.equal(normal.placement, 'above');
  assert.ok(normal.maxHeight <= 600);
  const keyboard = resolveComposerPopoverLayout({
    anchorTop: 370, anchorBottom: 440, visibleTop: 0, visibleBottom: 460,
  });
  assert.equal(keyboard.placement, 'above');
  assert.ok(keyboard.maxHeight <= 370);
  assert.ok(keyboard.maxHeight < normal.maxHeight);
  const offset = resolveComposerPopoverLayout({
    anchorTop: 450, anchorBottom: 500, visibleTop: 180, visibleBottom: 520,
  });
  assert.equal(offset.placement, 'above');
  assert.ok(offset.maxHeight <= 270);
  const highComposer = resolveComposerPopoverLayout({
    anchorTop: 40, anchorBottom: 110, visibleTop: 0, visibleBottom: 800,
  });
  assert.equal(highComposer.placement, 'below');
  assert.ok(highComposer.maxHeight <= 690);
  const noRoom = resolveComposerPopoverLayout({
    anchorTop: 40, anchorBottom: 200, visibleTop: 100, visibleBottom: 180,
  });
  assert.equal(noRoom.maxHeight, 0);
});

test('Work preserves an expanded two-row composer while Chat stays compact', () => {
  assert.match(styles, /Work keeps its expanded, two-row input/);
  assert.match(styles, /data-composer-mode="work"\] \.as-work-composer-surface/);
  assert.match(styles, /data-composer-mode="chat"\] \.agentsam-composer-surface\s*\{[^}]*flex-direction: row/s);
  assert.match(composer, /toolbarStart=\{<>\{trigger\}/);
  assert.doesNotMatch(composer, /<RunModeSelect/);
  assert.match(composer, /toolbarEnd=\{<>\<ModelSelect workStyle \/>/);
  assert.ok(composer.indexOf('workMode && showWorkShortcuts') > composer.indexOf('<AgentComposer'), 'Work shortcut links follow the shared composer');
  assert.match(composer, /attachmentPreview=\{attachmentPreview\}/);
  assert.match(composer, /stageChatFile\(file, user\?\.id/);
  assert.match(composer, /workMode && showWorkShortcuts/);
  assert.match(composer, /onClick=\{openProject\}/);
  assert.match(composer, /onClick=\{openPlugins\}/);
  assert.match(composer, /fileRef\.current\?\.click\(\)/);
  assert.match(page, /showWorkShortcuts=\{data\.mode === 'work' && \(workFocused \|\| \(empty && !leadComposerDetached\)\)\}/);
});


test('Side Stage opens from one header toggle, then offers its own full-view control', () => {
  const stage=read('frontend/src/components/workbench/side-stage.tsx');
  assert.match(page, /label=\{state\.sideOpen \? 'Close side workspace' : 'Open side workspace'\}/);
  assert.match(page, /onClick=\{toggleSideWorkspace\}/);
  assert.match(page, /<SideStage workFocused=\{workFocused\} onFocusToggle=/);
  assert.match(stage, /\{onFocusToggle && <IconAction/);
  assert.doesNotMatch(page, /hint="Toggle focused Side Stage"/);
});

test('Full view retains the lead composer and shared plus menu in a movable chat panel', () => {
  assert.match(page, /className="agentsam-floating-lead-chat"/);
  assert.match(page, /label="Drag chat panel"/);
  assert.match(page, /onPointerMove=\{onFloatingDragMove\}/);
  assert.match(page, /onKeyDown=\{event =>/);
  assert.match(page, /className="agentsam-floating-chat-composer">\{leadComposer\}/);
  assert.match(styles, /\.agentsam-floating-lead-chat \.agentsam-plugin-host/);
  assert.match(styles, /\.agentsam-floating-lead-chat \.as-work-shortcuts/);
});

test('Work split puts the stage before chat and preserves resize direction', () => {
  assert.match(page, /const workSplit = data.mode === 'work' && state.sideOpen && !workFocused && !compactWorkLayout/);
  assert.match(page, /workSplit \? " is-work-stage-first"/);
  assert.match(page, /workSplit \? delta : -delta/);
  assert.match(styles, /\.agentsam-workspace.is-work-stage-first \{\s*flex-direction:row-reverse/s);
});

test('Unsent attachment cards survive composer relocation without persisting browser object URLs', () => {
  const store=read('frontend/src/lib/work/store.ts');
  assert.match(composer, /pendingComposerAttachments\[targetId\] \?\? EMPTY_PENDING_ATTACHMENTS/);
  assert.match(composer, /setPendingComposerAttachments\(targetId, next\)/);
  assert.match(store, /pendingComposerAttachments: \{\}/);
  assert.match(store, /setPendingComposerAttachments: \(id, next\) => set/);
  const partialize=store.slice(store.lastIndexOf('partialize: (s) =>'));
  assert.doesNotMatch(partialize, /pendingComposerAttachments/);
});

test('Browser annotation lives beside the Browser tab and reuses miniAgentSam', () => {
  const stage=read('frontend/src/components/workbench/side-stage.tsx');
  const browser=read('frontend/src/components/workbench/browser.tsx');
  const helper=read('frontend/agentsam/AnnotationHelper.tsx');
  assert.match(stage, /item.kind === 'browser' && item.id === activeId && <AnnotationToggle/);
  assert.doesNotMatch(browser, /className="as-browser-annotate"/);
  assert.match(helper, /<MiniAgentSam selecting=\{selecting\}/);
  assert.match(helper, /setPendingAnnotations\(id, items/);
  assert.match(helper, /setPendingComposerAttachments\(id, items/);
  assert.match(helper, /onAttach=\{\(\) => fileInput.current\?\.click\(\)\}/);
});

test('Selected annotation cards are portable context, not exposed JSON in the draft', () => {
  const store=read('frontend/src/lib/work/store.ts');
  const helper=read('frontend/agentsam/AnnotationHelper.tsx');
  const thread=read('frontend/src/components/workbench/thread.tsx');
  assert.match(composer, /pendingAnnotations\.map\(annotation/);
  assert.match(store, /formatAnnotationContext\(m\.metadata\?\.annotations\)/);
  assert.match(thread, /aria-label="Referenced annotations"/);
  assert.doesNotMatch(helper, /JSON\.stringify\(selection\)/);
  assert.doesNotMatch(store.slice(store.lastIndexOf('partialize: (s) =>')), /pendingAnnotations/);
});
