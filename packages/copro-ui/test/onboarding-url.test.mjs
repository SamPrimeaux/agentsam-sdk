import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOnboardingUrl} from '../dist/onboarding-url.js';

test('onboarding directory routes retain one trailing slash',()=>{
  assert.equal(normalizeOnboardingUrl('/moviemode/primetech-onboarding'),'/moviemode/primetech-onboarding/');
  assert.equal(normalizeOnboardingUrl('/moviemode/primetech-onboarding/'),'/moviemode/primetech-onboarding/');
});

test('onboarding HTML entrypoints are not rewritten as directories',()=>{
  assert.equal(normalizeOnboardingUrl('/primetech-onboarding/index.html'),'/primetech-onboarding/index.html');
  assert.equal(normalizeOnboardingUrl('/primetech-onboarding/index.html?source=standalone'),'/primetech-onboarding/index.html?source=standalone');
});
