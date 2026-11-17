import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePluginCatalogEndpoint } from './plugin-discovery-policy.js';

const source = 'https://plugins.inneranimalmedia.com/catalog/plugins';

test('accepts the pinned Remote Desktop Commander endpoint and root resource', () => {
  const entry = validatePluginCatalogEndpoint({
    pluginKey: 'agentsam-remote-desktop-commander',
    source,
    endpointUrl: 'https://mcp.desktopcommander.app/mcp',
    oauthResource: 'https://mcp.desktopcommander.app',
    remoteMcp: true,
    identityMode: 'oauth_state_bound',
  });
  assert.equal(entry.endpointUrl, 'https://mcp.desktopcommander.app/mcp');
  assert.equal(entry.oauthResource, 'https://mcp.desktopcommander.app');
  assert.equal(entry.identityMode, 'oauth_state_bound');
});

test('rejects a different external MCP origin', () => {
  assert.throws(() => validatePluginCatalogEndpoint({
    pluginKey: 'agentsam-remote-desktop-commander',
    source,
    endpointUrl: 'https://example.invalid/mcp',
    oauthResource: 'https://example.invalid',
    remoteMcp: true,
    identityMode: 'oauth_state_bound',
  }), /plugin_catalog_external_endpoint_untrusted/);
});

test('rejects state-bound identity mode for an uncurated plugin', () => {
  assert.throws(() => validatePluginCatalogEndpoint({
    pluginKey: 'agentsam-other-plugin',
    source,
    endpointUrl: 'https://mcp.desktopcommander.app/mcp',
    oauthResource: 'https://mcp.desktopcommander.app',
    remoteMcp: true,
    identityMode: 'oauth_state_bound',
  }), /plugin_catalog_external_endpoint_untrusted/);
});

test('keeps first-party plugins on their catalog origin and Studio handoff mode', () => {
  const entry = validatePluginCatalogEndpoint({
    pluginKey: 'agentsam-sales',
    source,
    endpointUrl: 'https://plugins.inneranimalmedia.com/mcp/sales',
    oauthResource: 'https://plugins.inneranimalmedia.com/mcp',
    remoteMcp: false,
    identityMode: 'studio_handoff',
  });
  assert.equal(entry.remoteMcp, false);
  assert.equal(entry.identityMode, 'studio_handoff');
  assert.equal(entry.oauthResource, 'https://plugins.inneranimalmedia.com/mcp');
});
