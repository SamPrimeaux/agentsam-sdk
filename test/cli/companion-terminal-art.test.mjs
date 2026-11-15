import assert from 'node:assert/strict';
import test from 'node:test';
import pkg from '../../package.json' with { type: 'json' };
import { brandedTerminalHeader, companionTerminalArt, renderCompanionTerminalArt } from '../../src/ui/companion-art.js';

test('generated Geaux art is present and renders safely in monochrome', () => {
  const art = companionTerminalArt();
  assert.equal(art.companionId, 'geaux');
  assert.equal(art.grid.length, art.height);
  assert.ok(art.grid.every((row) => row.length === art.width));
  const plain = renderCompanionTerminalArt(art.grid, { color: false });
  assert.match(plain, /█/);
  assert.doesNotMatch(plain, /\x1b\[/);
});

test('branded terminal header uses the actual npm package version', () => {
  const heading = brandedTerminalHeader({ project: 'demo', model: 'local', cwd: '~', version: pkg.version, color: false });
  assert.match(heading, /AgentSam CLI/);
  assert.ok(heading.includes('v' + pkg.version));
  assert.match(heading, /demo/);
});
