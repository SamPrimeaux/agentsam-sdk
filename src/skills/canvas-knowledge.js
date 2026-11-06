import { loadSkill } from './catalog.js';
import { loadCanvasCreationKnowledge as loadKnowledge } from './canvas-knowledge-core.js';
export { validateCanvasDirections } from './canvas-knowledge-core.js';

/** Node host uses the canonical filesystem catalog; Worker hosts supply the packaged catalog. */
export function loadCanvasCreationKnowledge(options = {}) {
  return loadKnowledge(options, { loadSkill });
}
