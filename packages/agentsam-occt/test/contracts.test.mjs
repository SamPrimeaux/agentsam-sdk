import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCT_ENGINE_ID,
  OCCT_NATIVE_CAPABILITIES,
  OCCT_NATIVE_OPERATIONS,
  OCCT_PROVIDER_CONTRACT,
  toMillimeters,
} from '../src/index.js';
import { createOcctNativeProvider } from '../src/native-provider.mjs';

test('OCCT exposes one canonical provider contract and explicit operation surface', () => {
  assert.equal(OCCT_ENGINE_ID, 'occt');
  assert.equal(OCCT_PROVIDER_CONTRACT, 'agentsam.occt.provider.v1');
  assert.deepEqual(OCCT_NATIVE_OPERATIONS, ['design_model_build', 'design_model_inspect']);
  assert.deepEqual(OCCT_NATIVE_CAPABILITIES, ['design.solid.create', 'design.solid.inspect', 'design.solid.export.step']);
});

test('native dimensions normalize to millimeters and reject implicit units', () => {
  assert.equal(toMillimeters(10, 'in'), 254);
  assert.equal(toMillimeters(100, 'mm'), 100);
  assert.throws(() => toMillimeters(10, undefined), /occt_explicit_units_required/);
  assert.throws(() => toMillimeters(-1, 'mm'), /occt_invalid_dimension/);
});

test('native provider reports unavailable instead of fake-ready when binary is missing', async () => {
  const provider = createOcctNativeProvider({ binary: '/no/such/agentsam-occt' });
  assert.deepEqual(await provider.doctor(), {
    engine: 'occt', available: false, ready: false,
    reason: 'occt_binary_not_configured', execution_lane: 'local',
  });
});
