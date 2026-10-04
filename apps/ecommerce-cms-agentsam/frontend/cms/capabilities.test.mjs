import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ECOMMERCE_CMS_CAPABILITIES,
  assertEcommerceCmsAuthoringContract,
} from './capabilities.mjs';

test('ecommerce CMS is composition-first: groups, sections, blocks', () => {
  assert.equal(assertEcommerceCmsAuthoringContract(), ECOMMERCE_CMS_CAPABILITIES);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.groups.organize, true);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.sections.reorder, true);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.blocks.reorder, true);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.revisions.compositionSnapshots, true);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.routes.publish, true);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.media.upload, true);
  assert.equal(ECOMMERCE_CMS_CAPABILITIES.runtime.desktopAuthenticatedBridge, true);
});
