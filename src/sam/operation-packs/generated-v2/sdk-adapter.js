/** SDK-native registration; call from an authenticated host installation. */
import { defineSamOperation } from '../../define.js';
import { registerSamOperation, getSamOperation } from '../../registry.js';
import { createGeneratedSamOperations } from './operation-pack.js';
export function installGeneratedOperations(dependencies = {}) {
  return createGeneratedSamOperations({
    defineSamOperation, registerSamOperation, getSamOperation, ...dependencies,
  });
}
