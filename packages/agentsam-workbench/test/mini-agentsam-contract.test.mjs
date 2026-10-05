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
  assert.match(brand, /\/brand\/agentsam-mark-on-dark\.svg/);
  assert.match(brand, /\/brand\/agentsam-mark-on-light\.svg/);
  assert.deepEqual(packagedIcon, canonicalIcon);
  assert.doesNotMatch(brand, /imagedelivery|https?:\/\//);
});
