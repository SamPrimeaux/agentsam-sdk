import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCompanyRow } from '../src/contracts/company.js';

describe('company contract', () => {
  it('normalizes D1 row to portal branding shape', () => {
    const out = normalizeCompanyRow({
      id: 'co_default',
      slug: 'acme',
      name: 'Acme Co',
      logo_url: '/logo.svg',
      auth_bg_color: '#050508',
      primary_color: '#007AFF',
      meta_json: '{"footer":"ok"}',
      created_at: 1,
      updated_at: 2,
    });
    assert.equal(out.slug, 'acme');
    assert.equal(out.logoUrl, '/logo.svg');
    assert.equal(out.meta.footer, 'ok');
  });
});
