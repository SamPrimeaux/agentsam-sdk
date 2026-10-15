import { createCmsOperations as createPortableCmsOperations, validateCmsSchema } from '@inneranimalmedia/agentsam-cms';
import { defineSamOperation } from '../../define.js';
export { validateCmsSchema };
export function createCmsOperations(options = {}) {
  return createPortableCmsOperations({ ...options, defineSamOperation });
}
