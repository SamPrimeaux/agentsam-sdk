import { createCmsOperations as createPortableCmsOperations, validateCmsSchema } from '../../../../packages/agentsam-cms/src/index.js';
import { defineSamOperation } from '../../define.js';
export { validateCmsSchema };
export function createCmsOperations(options = {}) {
  return createPortableCmsOperations({ ...options, defineSamOperation });
}
