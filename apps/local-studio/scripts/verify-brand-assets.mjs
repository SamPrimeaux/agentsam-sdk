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
const white = await read('assets/brand/AgentSam-Mark-White.svg');
const dark = await read('apps/local-studio/frontend/public/brand/agentsam-mark-on-dark.svg');
const light = await read('apps/local-studio/frontend/public/brand/agentsam-mark-on-light.svg');
const brandConfig = await read('apps/local-studio/frontend/agentsam/brand.ts');
const desktopIndex = await read('apps/local-studio/frontend/desktop/index.html');
const desktopHost = await read('apps/local-studio/frontend/agentsam/PackagedConsoleFrame.tsx');
const desktopIdentity = await read('apps/local-studio/frontend/src/lib/auth/use-current-user.ts');
const desktopPet = await read('apps/local-studio/frontend/src/components/desktop/AgentSamPetWindow.tsx');
const desktopEntry = await read('apps/local-studio/frontend/desktop/src/main.tsx');
const manifest = JSON.parse(
  await read('packages/agentsam-desktop-shell/manifests/local-studio.json'),
);

assert.equal(pathData(white), pathData(canonical), 'approved white mark geometry drifted');
assert.equal(pathData(dark), pathData(canonical), 'dark shell mark geometry drifted');
assert.equal(pathData(light), pathData(canonical), 'light shell mark geometry drifted');
assert.match(white, /fill="#FFFFFF"/i);
assert.equal(dark, white, 'packaged dark-surface mark must match the approved white source');
assert.match(light, /fill="#202020"/i);

assert.ok(desktopIndex.includes('id="agentsam-desktop-boot"'), 'desktop entry must include a pre-React boot surface');
assert.ok(desktopIndex.includes('src="/brand/agentsam-mark-on-dark.svg"'), 'desktop boot must use the local white mark');
assert.ok(desktopIndex.includes('src="./brand/agentsam-mark-on-dark.svg"'), 'desktop recovery state must use a relative bundled logo URL');
assert.match(desktopIndex, /prefers-reduced-motion/, 'desktop boot must respect reduced-motion preferences');
assert.match(desktopIndex, /agentsam:desktop-shell-ready/, 'desktop boot must wait for the shell-ready event');
assert.match(desktopHost, /agentsam:desktop-shell-ready/, 'packaged console must signal shell readiness');
assert.match(desktopIdentity, /agentsam:desktop-shell-ready/, 'secure identity restore must wait for shell readiness');
assert.match(desktopPet, /agentsam:desktop-shell-ready/, 'pet window must release its own identity restore gate');
assert.ok(!desktopEntry.includes('clearTimeout(window.__AGENTSAM_DESKTOP_BOOT_GUARD__)'), 'React entry must not clear the boot guard before shell readiness');

assert.equal(
  manifest.app_icon?.mark,
  'icons/local-studio/AgentSam-Mark.svg',
  'desktop manifest must consume canonical AgentSam mark',
);

// The Local Studio shell intentionally uses the approved Geaux mascot as
// its live brand mark; the canonical monochrome marks remain the app/PWA
// identity assets checked above and in the desktop manifest.
const shellMascotPath = '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg';
assert.match(brandConfig, new RegExp(`logo: '${shellMascotPath.replaceAll('/', '\\/')}'`));
assert.match(brandConfig, new RegExp(`lightLogo: '${shellMascotPath.replaceAll('/', '\\/')}'`));
const shellMascot = await read('apps/local-studio/frontend/public' + shellMascotPath);
assert.match(shellMascot, /<svg[\s>]/i, 'AgentSam shell mascot must resolve to a local SVG asset');
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

console.log('Local Studio brand assets PASS · canonical white mark · dark/light variants · pre-React desktop boot · shell-ready identity restore');
