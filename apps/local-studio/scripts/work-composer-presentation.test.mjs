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

test('image attachments expand the composer above the draft and keep controls below', () => {
  assert.match(composer, /className="flex max-h-\[376px\] flex-wrap items-start gap-3 overflow-y-auto/);
  assert.match(composer, /size-32 shrink-0[^\"]*sm:size-40 md:size-44/);
  assert.match(composer, /object-contain p-1/);
  assert.doesNotMatch(composer, /absolute inset-x-0 bottom-0 truncate bg-black/);
  assert.match(composer, /attachmentPreview=\{attachmentPreview\}/);
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
  assert.match(composer, /attachmentPreview=\{attachmentPreview\}/);
  assert.match(composer, /workMode && showWorkShortcuts/);
  assert.match(composer, /onClick=\{openProject\}/);
  assert.match(composer, /onClick=\{openPlugins\}/);
  assert.match(composer, /fileRef\.current\?\.click\(\)/);
  assert.match(page, /showWorkShortcuts=\{data\.mode === 'work' && empty && !leadComposerDetached\}/);
});
