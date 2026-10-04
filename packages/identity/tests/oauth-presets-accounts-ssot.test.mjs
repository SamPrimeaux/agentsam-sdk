import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveOAuthCredentialLane } from '../src/oauth/credentials.js';
import { resolveGoogleExchangeSecret } from '../src/oauth/goaude.js';
import { IdentityProviders } from '../src/contracts/provider.js';
import { loadIdentityProviders, normalizeProviderTemplateId } from '../../../src/features/resolve.js';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(PKG, 'src/migrations/0001_identity_core.sql');

describe('identity OAuth presets + accounts SSOT', () => {
  it('migration declares accounts as SSOT before account_identities', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS accounts/);
    assert.match(sql, /account_identities[`']?\s+is IdP linkage only/i);
    assert.match(sql, /never the account SSOT/i);
    const accountsAt = sql.indexOf('CREATE TABLE IF NOT EXISTS accounts');
    const identitiesAt = sql.indexOf('CREATE TABLE IF NOT EXISTS account_identities');
    assert.ok(accountsAt >= 0 && identitiesAt > accountsAt);
  });

  it('provider catalog includes google_desktop + cloudflare', () => {
    const providers = loadIdentityProviders();
    const ids = providers.map((p) => p.id);
    assert.ok(ids.includes('google_desktop'));
    assert.ok(ids.includes('cloudflare'));
    assert.ok(IdentityProviders.includes('google_desktop'));
    assert.equal(normalizeProviderTemplateId('google-desktop'), 'google_desktop');
  });

  it('resolves google_desktop and cloudflare credential lanes', () => {
    const desktop = resolveOAuthCredentialLane(
      { GOOGLE_DESKTOP_CLIENT_ID: 'desk.apps.googleusercontent.com' },
      'google_desktop',
    );
    assert.equal(desktop?.lane, 'byok_google_desktop');
    assert.equal(desktop?.provider, 'google_desktop');

    const cf = resolveOAuthCredentialLane(
      { CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client' },
      'cloudflare',
    );
    assert.equal(cf?.lane, 'byok_cloudflare');
    assert.equal(cf?.clientSecret, '');
  });

  it('desktop exchange secret resolution prefers public PKCE', () => {
    const resolved = resolveGoogleExchangeSecret(
      { GOOGLE_DESKTOP_CLIENT_ID: 'desk.apps.googleusercontent.com' },
      'desk.apps.googleusercontent.com',
    );
    assert.equal(resolved.mode, 'desktop_public_pkce');
    assert.equal(resolved.clientSecret, null);
  });
});
