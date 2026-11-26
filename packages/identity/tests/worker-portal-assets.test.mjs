import assert from 'node:assert/strict';
import test from 'node:test';
import { handleIdentityWorkerRequest } from '../src/server/worker-router.js';
import { createRouteRegistry, defineRouteProjection, IDENTITY_ROUTE_IDS } from '../src/contracts/routes.js';

const app = { id: 'storefront-customer-auth' };
const routeRegistry = createRouteRegistry([defineRouteProjection({
  appId: app.id,
  routes: {
    [IDENTITY_ROUTE_IDS.LOGIN]: '/auth/login',
    [IDENTITY_ROUTE_IDS.SIGNUP]: '/auth/signup',
    [IDENTITY_ROUTE_IDS.RESET]: '/auth/reset',
    [IDENTITY_ROUTE_IDS.RECOVERY]: '/auth/login',
    [IDENTITY_ROUTE_IDS.APP_AUTHENTICATED]: '/account',
    [IDENTITY_ROUTE_IDS.OAUTH_CALLBACK]: '/api/oauth/:provider/callback',
  },
})]);

test('Identity Worker serves packaged portal pages from host-mapped static assets', async () => {
  let requestedAsset = null;
  const env = {
    DB: {},
    ASSETS: {
      async fetch(request) {
        requestedAsset = new URL(request.url).pathname;
        return new Response('identity portal asset', { headers: { 'content-type': 'text/html' } });
      },
    },
  };
  const response = await handleIdentityWorkerRequest(
    new Request('https://store.example.test/auth/login'),
    env,
    {
      adapter: {},
      app,
      routeRegistry,
      portalAssetPaths: {
        '/auth/login': '/identity-portal/pages/login.html',
        '/auth/signup': '/identity-portal/pages/signup.html',
        '/auth/reset': '/identity-portal/pages/reset.html',
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'identity portal asset');
  assert.equal(requestedAsset, '/identity-portal/pages/login.html');
});
