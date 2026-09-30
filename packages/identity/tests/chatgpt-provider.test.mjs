import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ChatGptProvider,
  createChatGptCmsAuthHost,
  normalizeChatGptIdentity,
  readChatGptUserFromHeaders,
  chatGPTSignInPath,
  CHATGPT_USER_EMAIL_HEADER,
  CHATGPT_USER_FULL_NAME_HEADER,
  CHATGPT_USER_FULL_NAME_ENCODING_HEADER,
  CHATGPT_PERCENT_ENCODED_UTF8,
} from '../src/providers/chatgpt/index.js';
import {
  listStockSignInOptions,
  getStockSignInOption,
  CMS_STOCK_SIGN_IN_IDS,
} from '../src/contracts/sign-in-options.js';
import { getIdentityProvider, listIdentityProviders } from '../src/providers/index.js';
import { IdentityProviders } from '../src/contracts/provider.js';

describe('chatgpt identity provider', () => {
  it('reads hosted headers without leaking raw oai keys into normalized identity', () => {
    const user = readChatGptUserFromHeaders({
      [CHATGPT_USER_EMAIL_HEADER]: 'Sam@Example.com',
      [CHATGPT_USER_FULL_NAME_HEADER]: 'Sam%20Primeaux',
      [CHATGPT_USER_FULL_NAME_ENCODING_HEADER]: CHATGPT_PERCENT_ENCODED_UTF8,
    });
    assert.equal(user?.email, 'sam@example.com');
    assert.equal(user?.fullName, 'Sam Primeaux');

    const normalized = normalizeChatGptIdentity({
      email: user.email,
      name: user.fullName,
      sub: user.email,
    });
    assert.equal(normalized.provider, 'chatgpt');
    assert.equal(normalized.subject, 'sam@example.com');
    assert.equal(normalized.name, 'Sam Primeaux');
    assert.equal(normalized.raw?.source, 'chatgpt_hosted');
    assert.ok(!JSON.stringify(normalized).includes('oai-authenticated'));
  });

  it('registers chatgpt on the identity provider registry', () => {
    assert.equal(ChatGptProvider.id, 'chatgpt');
    assert.ok(IdentityProviders.includes('chatgpt'));
    assert.equal(getIdentityProvider('chatgpt')?.id, 'chatgpt');
    assert.ok(listIdentityProviders().some((p) => p.id === 'chatgpt'));
  });

  it('CmsAuthHost allows when headers present and challenges when missing', async () => {
    const host = createChatGptCmsAuthHost({ cmsBase: '/cms' });
    const denied = await host.authorizeCmsAccess({ path: '/cms', headers: {} });
    assert.equal(denied.allowed, false);
    assert.ok(String(denied.challengeUrl).startsWith('/signin-with-chatgpt'));

    const allowed = await host.authorizeCmsAccess({
      path: '/cms',
      headers: { [CHATGPT_USER_EMAIL_HEADER]: 'editor@example.com' },
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.principal?.email, 'editor@example.com');
    assert.equal(allowed.principal?.provider, 'chatgpt');
  });

  it('stock sign-in catalog includes cloudflare, google, iam, chatgpt', () => {
    const ids = listStockSignInOptions().map((o) => o.id);
    assert.deepEqual(ids, ['cloudflare', 'google', 'inneranimalmedia', 'chatgpt']);
    assert.deepEqual([...CMS_STOCK_SIGN_IN_IDS], ids);
    assert.equal(getStockSignInOption('iam')?.id, 'inneranimalmedia');
    assert.equal(getStockSignInOption('openai')?.id, 'chatgpt');
    assert.equal(getStockSignInOption('chatgpt')?.kind, 'hosted_headers');
    assert.ok(chatGPTSignInPath('/cms').includes('return_to='));
  });
});
