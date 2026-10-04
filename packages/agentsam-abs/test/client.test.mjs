import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSamBrowserClient } from '../dist/client.js';

const page = (name) => ({
  html: '<html><head><title>' + name + ' - Home</title></head><body>' + name + '</body></html>',
  breadcrumb: { sitename: name, page: 'Home' },
  scrollPosition: 0,
  timestamp: 1,
  tokenCount: { input: 1, output: 1 },
  prompt: name,
  contextHtml: null,
  isGrounded: false,
  groundingSources: [],
  searchEntryPointHtml: '',
});

test('ABS client keeps deterministic generated history', () => {
  const client = new AgentSamBrowserClient();
  client.pushSnapshot(page('One'));
  client.pushSnapshot(page('Two'));
  assert.equal(client.getActiveTab().currentIndex, 1);
  assert.equal(client.back().breadcrumb.sitename, 'One');
  assert.equal(client.forward().breadcrumb.sitename, 'Two');
});

test('ABS history branches after jumping backward', () => {
  const client = new AgentSamBrowserClient();
  client.pushSnapshot(page('One'));
  client.pushSnapshot(page('Two'));
  client.back();
  client.pushSnapshot(page('Three'));
  assert.deepEqual(
    client.getActiveTab().history.map((entry) => entry.breadcrumb.sitename),
    ['One', 'Three'],
  );
});
