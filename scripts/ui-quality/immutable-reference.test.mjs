import test from 'node:test';
import assert from 'node:assert/strict';
import { isImmutableDesignReference } from './immutable-reference.mjs';

test('only frozen original HTML imports skip authored UI gates', () => {
  for (const path of [
    'apps/design-canvas/public/sources/agentsam/Shell.dc.html',
    'apps/design-canvas/public/sources/onboarding/Checkout.dc.html',
    'apps/design-canvas/public/sources/onboarding-exports/Onboarding.dc.html',
    'apps/design-canvas/public/sources/onboarding-exports/OnboardingOffersCollection.html',
    'apps/design-canvas/public/sources/stock/choose-a-plan/Main.dc.html',
    'apps/design-canvas/public/sources/stock/workspace-setup/Onboarding.dc.html',
    'apps/design-canvas/public/sources/stock/style-spec-bw/StyleSpec.dc.html',
    'apps/design-canvas/public/sources/stock/mini-confirmation/MiniAgentSamPublish.dc.html',
  ]) assert.equal(isImmutableDesignReference(path), true, path);

  for (const path of [
    'apps/design-canvas/src/DesignCanvasApp.tsx',
    'apps/design-canvas/index.html',
    'apps/design-canvas/public/sources/reference/BrowserControl.html',
    'apps/design-canvas/public/sources/media/dispatch.html',
    'apps/design-canvas/public/sources/agentsam/NewProductionPage.html',
    'apps/design-canvas/public/sources/stock/new-fake-stock/Fake.dc.html',
    'apps/design-canvas/public/sources/stock/choose-a-plan/Fake.dc.html',
    'apps/design-canvas/public/sources/stock/choose-a-plan/README.md',
    'apps/design-canvas/public/sources/reference/StockNewPage.dc.html',
    'apps/another-app/public/sources/agentsam/Shell.dc.html',
  ]) assert.equal(isImmutableDesignReference(path), false, path);
});
