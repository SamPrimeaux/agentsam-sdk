import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { browserCommand, promptToOpenUrl } from '../src/lib/open-url.js';

test('browserCommand uses argv-safe platform launchers', () => {
  assert.deepEqual(browserCommand('https://inneranimalmedia.com/auth', 'darwin'), {
    command: 'open',
    args: ['https://inneranimalmedia.com/auth'],
  });
  assert.deepEqual(browserCommand('https://inneranimalmedia.com/auth', 'linux'), {
    command: 'xdg-open',
    args: ['https://inneranimalmedia.com/auth'],
  });
  assert.deepEqual(browserCommand('https://inneranimalmedia.com/auth', 'win32'), {
    command: 'cmd',
    args: ['/c', 'start', '', 'https://inneranimalmedia.com/auth'],
  });
});

test('browserCommand rejects non-http protocols', () => {
  assert.throws(() => browserCommand('file:///tmp/example', 'darwin'), /Unsupported URL protocol/);
  assert.throws(() => browserCommand('javascript:alert(1)', 'darwin'), /Unsupported URL protocol/);
});

test('promptToOpenUrl stays non-interactive when stdin is not a TTY', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', chunk => { text += chunk.toString(); });
  let opened = false;
  const result = await promptToOpenUrl('https://www.blender.org/download/', {
    input,
    output,
    openImpl: () => { opened = true; },
  });
  assert.equal(result.interactive, false);
  assert.equal(result.opened, false);
  assert.equal(opened, false);
  assert.match(text, /https:\/\/www\.blender\.org\/download\//);
  assert.match(text, /Open the URL above in a browser/);
});

test('promptToOpenUrl waits for Enter before opening in a TTY', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  let text = '';
  output.on('data', chunk => { text += chunk.toString(); });
  let openedUrl = null;
  const pending = promptToOpenUrl('https://inneranimalmedia.com/dashboard', {
    input,
    output,
    openImpl: url => { openedUrl = url; },
  });
  input.write('\n');
  const result = await pending;
  assert.equal(result.interactive, true);
  assert.equal(result.opened, true);
  assert.equal(openedUrl, 'https://inneranimalmedia.com/dashboard');
  assert.match(text, /Press ENTER to open/);
  assert.match(text, /Browser opened/);
});
