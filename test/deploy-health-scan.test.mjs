import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scanTextForSecrets } from '../src/lib/deploy/secret-scan.js';
import { HEALTH_USER_AGENT, parseWranglerVersionId, probeDeployHealth, resolveHealthOrigin } from '../src/lib/deploy/health.js';

describe('deploy secret scan', () => {
  it('allows fixture oauth values', () => {
    const findings = scanTextForSecrets(
      'CLOUDFLARE_OAUTH_CLIENT_ID=sillynotreal\nCLOUDFLARE_OAUTH_CLIENT_SECRET=sillynotreal-secret\n',
      { filename: 'apps/local-studio/.env.cloudflare.example' },
    );
    assert.equal(findings.length, 0);
  });

  it('flags live openai-like keys', () => {
    const findings = scanTextForSecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345');
    assert.equal(findings.some((f) => f.label === 'openai-like'), true);
  });
});

describe('deploy health', () => {
  it('parses wrangler version ids', () => {
    assert.equal(
      parseWranglerVersionId('Current Version ID: e9747d3a-4db6-4e02-b6fe-aa5a47f1588b'),
      'e9747d3a-4db6-4e02-b6fe-aa5a47f1588b',
    );
  });

  it('reads hostname from wrangler.jsonc', () => {
    const origin = resolveHealthOrigin({
      env: {},
      wranglerConfigText: '{"routes":[{"pattern":"agentsam.inneranimalmedia.com","custom_domain":true}]}',
    });
    assert.equal(origin, 'https://agentsam.inneranimalmedia.com');
  });

  it('treats /health ok:true with connector unconfigured as healthy', async () => {
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/health')) {
        return {
          status: 200,
          json: async () => ({ ok: true, connections: { cloudflare: { configured: false } } }),
        };
      }
      return { status: 200, json: async () => ({}) };
    };
    const health = await probeDeployHealth('https://agentsam.inneranimalmedia.com', { fetchImpl });
    assert.equal(health.ok, true);
    assert.equal(health.results['/health'].appOk, true);
    assert.equal(health.results['/health'].cloudflareConfigured, false);
  });

  it('sends a browser-safe User-Agent so WAF does not 403 the probe', async () => {
    const seen = [];
    const fetchImpl = async (url, init = {}) => {
      seen.push({ url, init });
      return {
        status: 200,
        json: async () => ({ ok: true, connections: { cloudflare: { configured: false } } }),
      };
    };
    await probeDeployHealth('https://agentsam.inneranimalmedia.com', { fetchImpl, paths: ['/health'] });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].init.headers['User-Agent'], HEALTH_USER_AGENT);
    assert.match(seen[0].init.headers.Accept, /application\/json/);
  });
});
