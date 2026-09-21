import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENTSAM_MCP_PLUGIN_MANIFEST,
  INNERANIMALMEDIA_CLOUDFLARE_OAUTH_PLUGIN_MANIFEST,
} from '../../src/plugins/index.js';

test('Cloudflare OAuth installations have distinct client and callback contracts', () => {
  assert.equal(AGENTSAM_MCP_PLUGIN_MANIFEST.plugin_key, 'agentsam-mcp');
  assert.equal(AGENTSAM_MCP_PLUGIN_MANIFEST.auth_type, 'oauth');
  assert.equal(AGENTSAM_MCP_PLUGIN_MANIFEST.oauth_connect_url, '/api/connections/cloudflare/start');
  assert.equal(
    AGENTSAM_MCP_PLUGIN_MANIFEST.config.callback_url,
    'https://agentsam.inneranimalmedia.com/api/connections/cloudflare/callback',
  );
  assert.equal(AGENTSAM_MCP_PLUGIN_MANIFEST.config.token_auth_method, 'none_pkce');

  assert.equal(INNERANIMALMEDIA_CLOUDFLARE_OAUTH_PLUGIN_MANIFEST.plugin_key, 'inneranimalmedia-cf-oauth');
  assert.equal(INNERANIMALMEDIA_CLOUDFLARE_OAUTH_PLUGIN_MANIFEST.auth_type, 'oauth_via_iam');
  assert.equal(
    INNERANIMALMEDIA_CLOUDFLARE_OAUTH_PLUGIN_MANIFEST.oauth_connect_url,
    'https://inneranimalmedia.com/api/oauth/cloudflare/start',
  );
  assert.equal(
    INNERANIMALMEDIA_CLOUDFLARE_OAUTH_PLUGIN_MANIFEST.config.callback_url,
    'https://inneranimalmedia.com/api/oauth/cloudflare/callback',
  );
});
