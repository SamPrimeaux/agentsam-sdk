import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPOSER_GROUPS } from '../../../packages/agentsam-workbench/src/agent/capability-catalog.ts';

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
  assert.match(page, /Geaux is ready to GEAUX!/);
  assert.match(page, /Choose a companion/);
  assert.doesNotMatch(page, /agentsam-work-welcome-eyebrow/);
  assert.match(styles, /\.agentsam-work-welcome-art \{[^}]*width: 30px; height: 38px;[^}]*border: 0;[^}]*background: transparent;/s);
  assert.match(styles, /transform: translateY\(-5px\) scale\(2\)/);
  assert.match(styles, /align-items: flex-start/);
  assert.doesNotMatch(styles, /\.agentsam-work-welcome-art \{[^}]*width: clamp\(112px/);
});

test('plugins and connected services are available from the plus/@ menu, not persistent chips', () => {
  assert.match(picker, /aria-label="Add tools and plugins"/);
  assert.match(picker, /<Plus size=\{19\}\/>/);
  assert.match(picker, /aria-haspopup="dialog"/);
  assert.match(picker, /const match=value\.slice\(0,cursor\)\.match\(\/\(\?:\^\|\\s\)@/);
  assert.match(picker, /className="agentsam-plugin-menu"/);
  assert.match(picker, /entry\.label/);
  assert.match(picker, /entry\.description\|\|entry\.status/);
  assert.doesNotMatch(picker, /COMPOSER_GROUPS\.map/);
  assert.equal(COMPOSER_GROUPS[0].kind, 'mcp');
  assert.equal(COMPOSER_GROUPS[1].kind, 'connection');
  assert.doesNotMatch(picker, /agentsam-plugin-previews/);
  assert.doesNotMatch(styles, /agentsam-plugin-previews/);
  assert.match(styles, /max-height: min\(720px, 40dvh\)/);
  assert.match(styles, /\.agentsam-conversation-dock \.agentsam-plugin-menu \{ top: auto; bottom: calc\(100% \+ 10px\); \}/);
  assert.match(styles, /\.agentsam-plugin-row \{[^}]*min-height: 64px/);
});

test('image attachments expand the composer above the draft and keep controls below', () => {
  assert.match(composer, /className="flex max-h-\[376px\] flex-wrap items-start gap-3 overflow-y-auto/);
  assert.match(composer, /size-32 shrink-0[^\"]*sm:size-40 md:size-44/);
  assert.match(composer, /object-contain p-1/);
  assert.doesNotMatch(composer, /absolute inset-x-0 bottom-0 truncate bg-black/);
  assert.match(composer, /attachmentPreview=\{attachmentPreview\}/);
  assert.match(styles, /\.agentsam-composer-surface \.agentsam-composer-attachments \{ display: flex; width: 100%;/);
  assert.match(styles, /\.agentsam-composer-surface:has\(\.agentsam-composer-attachments\) \{\s*flex-direction: column/s);
  assert.match(composer, /<ProjectPicker trailId=\{targetId\} \/>/);
});
