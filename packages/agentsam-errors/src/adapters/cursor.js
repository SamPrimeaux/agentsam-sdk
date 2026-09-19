import { classifyProviderFailure } from './provider.js';
export function classifyCursorFailure(evidence = {}, context = {}) {
  return classifyProviderFailure('cursor', evidence, context);
}
