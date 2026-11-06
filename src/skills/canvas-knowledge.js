import { loadSkill } from './catalog.js';

const WEB_DOCUMENT_KINDS = new Set(['website', 'app-ui', 'commerce']);
const DIRECTION_ID = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Validate an actual AgentSam four-direction response before presenting it.
 * Options describe creative intent and are not theme or template identifiers.
 */
export function validateCanvasDirections(directions) {
  if (!Array.isArray(directions) || directions.length !== 4) {
    throw new Error('canvas_four_directions_required');
  }
  const ids = new Set();
  const titles = new Set();
  for (const item of directions) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !DIRECTION_ID.test(item.id || '') ||
        typeof item.title !== 'string' || item.title.trim().length < 3 ||
        item.title.length > 72 ||
        typeof item.description !== 'string' || item.description.trim().length < 12 ||
        item.description.length > 240 ||
        typeof item.creativeIntent !== 'string' ||
        item.creativeIntent.trim().length < 10 ||
        item.creativeIntent.length > 300) {
      throw new Error('canvas_direction_invalid');
    }
    const normalized = item.title.trim().toLocaleLowerCase();
    if (ids.has(item.id) || titles.has(normalized)) {
      throw new Error('canvas_directions_not_distinct');
    }
    if ('themeId' in item || 'siteId' in item || 'templateId' in item) {
      throw new Error('canvas_direction_must_not_bind_artifact_type');
    }
    ids.add(item.id);
    titles.add(normalized);
  }
  return directions;
}

/**
 * Load real skill files on direction selection—not on + New and not during
 * simulated progress. The caller remains responsible for authorized project
 * docs and for implementing the actual host executor and event receipts.
 *
 * CMS guidance applies to web UI/commerce or an explicitly requested CMS
 * handoff, never automatically to CAD, sketch, sculpt, or movie.
 */
export function loadCanvasCreationKnowledge({
  directions,
  selectedDirectionId,
  kind,
  cmsRequested = false,
} = {}) {
  validateCanvasDirections(directions);
  if (typeof selectedDirectionId !== 'string' ||
      !DIRECTION_ID.test(selectedDirectionId)) {
    throw new Error('canvas_direction_selection_required');
  }
  const selectedDirection = directions.find(item => item.id === selectedDirectionId);
  if (!selectedDirection) throw new Error('canvas_direction_not_offered');
  if (typeof kind !== 'string' || !kind.trim()) {
    throw new Error('canvas_document_kind_required');
  }
  const skillIds = ['agentsam-canvas-creation'];
  if (cmsRequested === true || WEB_DOCUMENT_KINDS.has(kind)) {
    skillIds.push('agentsam-cms-ready-creation');
  }
  return {
    selectedDirection: { ...selectedDirection },
    kind,
    skills: skillIds.map(id => loadSkill(id, { references: true })),
  };
}
