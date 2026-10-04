import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOAuthConsentView,
  normalizeOAuthConsentCompany,
  renderOAuthConsentHtml,
} from '../src/oauth/consent-view.js';

test('OAuth consent uses company as issuer brand SSOT without product-specific copy', () => {
  const company = normalizeOAuthConsentCompany({
    id: 'co_default',
    name: 'Ember Supply',
    logo_url: 'https://assets.example.test/logo.png',
    primary_color: '#f15a24',
    auth_bg_color: '#101214',
  });
  const view = buildOAuthConsentView({
    company,
    resource: {
      id: 'res_commerce_mcp',
      audience: 'https://ember.example/mcp',
      display_name: 'Ember Supply MCP',
      description: 'Store, content, and experience tools.',
    },
    client: {
      client_id: 'chatgpt',
      display_name: 'ChatGPT',
    },
    signed_in_email: 'customer@example.test',
    scopes: [
      {
        scope: 'commerce:store.read',
        label: 'Store data',
        description: 'Read published store and CMS data.',
        sort_order: 20,
      },
      {
        scope: 'commerce:experience.read',
        label: 'Interactive experiences',
        description: 'Read published interactive scene metadata.',
        sort_order: 10,
      },
    ],
  });

  assert.equal(view.issuer.name, 'Ember Supply');
  assert.equal(view.issuer.primaryColor, '#f15a24');
  assert.equal(view.copy.headline, 'Ember Supply MCP wants to connect to ChatGPT');
  assert.equal(view.copy.footer, 'Authorization secured by Ember Supply');
  assert.deepEqual(view.scopes.map((scope) => scope.scope), [
    'commerce:experience.read',
    'commerce:store.read',
  ]);
});

test('OAuth consent rejects missing resource audience instead of inventing one', () => {
  assert.throws(
    () => buildOAuthConsentView({
      company: { name: 'Example' },
      resource: { display_name: 'Example MCP' },
      client: { client_id: 'client', display_name: 'Client' },
    }),
    /oauth_consent_resource_audience_required/,
  );
});


test('OAuth consent renderer escapes malicious strings in every dynamic field', () => {
  const evil = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';

  const html = renderOAuthConsentHtml({
    company: {
      name: evil,
      logo_url: 'javascript:alert(3)', // must be dropped (not http/https)
      primary_color: 'red; } body { background: url(javascript:alert(4)) } .x {',
    },
    resource: {
      audience: 'https://example.test/mcp',
      display_name: evil,
      description: evil,
    },
    client: {
      client_id: 'evil-client',
      display_name: evil,
    },
    signed_in_email: evil,
    scopes: [
      { scope: 's1', label: evil, description: evil },
    ],
  }, { authorizationId: evil, csrfToken: evil });

  // Nothing from any dynamic field should survive as a live tag/attribute.
  assert.ok(!html.includes('<script>'), 'raw <script> tag leaked unescaped');
  assert.ok(!html.includes('<img src=x'), 'raw <img> tag leaked unescaped (would fire onerror as a live element)');
  // The dangerous substring is fine to appear as INERT escaped text -- what matters
  // is that it never appears as a live, browser-parsed tag (i.e. preceded by a raw '<').
  assert.ok(!html.includes('javascript:alert'), 'javascript: URL was not rejected by safeHttpUrl');
  assert.ok(!html.includes('background: url(javascript'), 'invalid color value leaked into <style> unescaped');

  // The escaped form of the payload should be present wherever it was rendered.
  const escaped = '&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;img src=x onerror=alert(2)&gt;';
  assert.ok(html.includes(escaped), 'expected HTML-escaped payload not found in output');

  // Invalid color input must fall back to the safe default, not pass through raw.
  assert.ok(html.includes('#171717') || html.includes('#0b1020'), 'expected safe fallback brand color not found');
});
