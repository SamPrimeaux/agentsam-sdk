import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessAiAccess,
  formatAiAccessOnboarding,
  CF_OAUTH_REQUIRED_REDIRECTS,
  LOCAL_STUDIO_LOGIN,
} from '../src/lib/ai-access-onboarding.js';
import { listModelCatalog } from '../src/models/catalog.js';
import { getModelRecord, mergeModelReference, listModelCatalog as listFromIndex } from '../src/models/index.js';

describe('listModelCatalog import surface', () => {
  it('is defined from catalog and models/index', () => {
    assert.equal(typeof listModelCatalog, 'function');
    assert.equal(typeof listFromIndex, 'function');
    assert.ok(listModelCatalog().length > 0);
    assert.equal(typeof getModelRecord, 'function');
    assert.equal(typeof mergeModelReference, 'function');
  });
});

describe('ai access onboarding', () => {
  it('marks ready when a provider credential is configured', () => {
    const access = assessAiAccess({
      inventory: { providers: [{ id: 'openai', configured: true }] },
      ollama: { online: false, models: [] },
      options: [{ value: 'none' }],
    });
    assert.equal(access.ready, true);
    assert.equal(access.hasProviderKeys, true);
  });

  it('marks not ready and formats setup paths', () => {
    const access = assessAiAccess({
      inventory: { providers: [{ id: 'openai', configured: false }] },
      ollama: { online: false, models: [] },
      options: [{ value: 'none' }],
    });
    assert.equal(access.ready, false);
    const text = formatAiAccessOnboarding(access, { wantCloudAi: true });
    assert.match(text, /ollama\.com\/download/);
    assert.match(text, /agentsam providers/);
    assert.match(text, /api\/oauth\/cloudflare\/start/);
    assert.ok(CF_OAUTH_REQUIRED_REDIRECTS.some((u) => u.includes('/api/oauth/cloudflare/callback')));
    assert.match(LOCAL_STUDIO_LOGIN, /next=\/agentsam/);
  });
});
