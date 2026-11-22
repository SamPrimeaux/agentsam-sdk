import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_RESERVED_ROWS, pickMark, renderHomeScreen } from '../../src/ui/home-screen.js';
import { AGENTSAM_MARK } from '../../src/ui/brand/agentsam-mark.generated.js';
import { getCliCommand } from '../../src/cli/command-catalog.js';

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

test('mark size follows the terminal and falls back to header only', () => {
  assert.equal(pickMark(120, 40), AGENTSAM_MARK.large);
  assert.equal(pickMark(80, 24), AGENTSAM_MARK.medium);
  assert.equal(pickMark(40, 12), null);
});

test('home screen fills every row above the prompt area and centers the mark', () => {
  for (const [cols, rows] of [[177, 92], [120, 40], [80, 24]]) {
    const out = renderHomeScreen({ version: '9.9.9', cwd: '~/demo', branch: 'main', cols, rows, color: false });
    const lines = out.replace(/\n$/, '').split('\n');
    assert.equal(lines.length, rows - HOME_RESERVED_ROWS, `${cols}x${rows}`);
    assert.ok(lines.every((line) => line.length <= cols));
    const mark = pickMark(cols, rows);
    const first = lines.find((line) => line.includes(mark[0].trim()));
    assert.equal(first.length - first.trimStart().length >= Math.floor((cols - mark[0].length) / 2), true);
  }
});

test('plain output carries no escape codes and names the product and version', () => {
  const out = renderHomeScreen({ version: '1.2.3', cwd: '~/demo', cols: 100, rows: 30, color: false });
  assert.equal(out.includes('\x1b'), false);
  assert.match(out, /AgentSam \(v1\.2\.3\)/);
  assert.match(strip(renderHomeScreen({ version: '1.2.3', cwd: '~/demo', cols: 100, rows: 30 })), /~\/demo/);
});

test('desktop app is open/desktop/studio; the terminal home is the default, not a command', () => {
  assert.equal(getCliCommand('open')?.id, 'open');
  assert.equal(getCliCommand('desktop')?.id, 'open');
  assert.equal(getCliCommand('studio')?.id, 'open');
  assert.equal(getCliCommand('tui'), null);
});
