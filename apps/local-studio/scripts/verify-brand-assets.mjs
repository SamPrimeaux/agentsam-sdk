import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const read = (relative, encoding = 'utf8') =>
  readFile(new URL(relative, root), encoding === null ? undefined : encoding);

function pathData(svg) {
  const match = String(svg).match(/<path\s+[^>]*d="([^"]+)"/i);
  assert.ok(match, 'AgentSam mark must contain a path');
  return match[1];
}

const canonical = await read('packages/agentsam-desktop-shell/icons/local-studio/AgentSam-Mark.svg');
const dark = await read('apps/local-studio/frontend/public/brand/agentsam-mark-on-dark.svg');
const light = await read('apps/local-studio/frontend/public/brand/agentsam-mark-on-light.svg');
const brandConfig = await read('apps/local-studio/frontend/agentsam/brand.ts');
const manifest = JSON.parse(
  await read('packages/agentsam-desktop-shell/manifests/local-studio.json'),
);

assert.equal(pathData(dark), pathData(canonical), 'dark shell mark geometry drifted');
assert.equal(pathData(light), pathData(canonical), 'light shell mark geometry drifted');
assert.match(dark, /fill="#e8eaef"/i);
assert.match(light, /fill="#202020"/i);

assert.equal(
  manifest.app_icon?.mark,
  'icons/local-studio/AgentSam-Mark.svg',
  'desktop manifest must consume canonical AgentSam mark',
);

assert.match(brandConfig, /agentsam-mark-on-dark\.svg/);
assert.match(brandConfig, /agentsam-mark-on-light\.svg/);
assert.doesNotMatch(brandConfig, /https?:\/\/|imagedelivery/);

const canonicalRaster = await read(
  'packages/agentsam-desktop-shell/icons/local-studio/icon.png',
  null,
);
const packagedRaster = await read(
  'apps/local-studio/frontend/public/brand/agentsam-local-studio-icon.png',
  null,
);
assert.deepEqual(
  packagedRaster,
  canonicalRaster,
  'packaged Local Studio app raster must remain byte-identical to its canonical source',
);

console.log('Local Studio brand assets PASS · one canonical mark · dark/light shell variants · local-only');
