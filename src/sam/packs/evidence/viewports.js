import { evidenceError } from './contract.js';

/**
 * The single viewport vocabulary. Folder and manifest values come from here, never from free text,
 * so "iphone", "390", "mobile" and "phone" can never again name the same size four ways.
 */
export const VIEWPORT_HEIGHTS = Object.freeze({ 320: 568, 390: 844, 430: 932, 768: 1024, 1024: 768, 1440: 900, 1920: 1080 });
export const viewportClass = (width) => (width < 600 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop');
export const viewportId = (width, height) => `${viewportClass(width)}-${width}x${height}`;
export const VIEWPORT_ID_RE = /^(mobile|tablet|desktop)-(\d{3,4})x(\d{3,4})$/;

export const EVIDENCE_VIEWPORTS = Object.freeze(Object.entries(VIEWPORT_HEIGHTS).map(([width, height]) => Object.freeze({
  id: viewportId(Number(width), height), class: viewportClass(Number(width)), width: Number(width), height,
})));
/** What a user-journey capture means by default: one phone, one tablet, one desktop. */
export const JOURNEY_VIEWPORTS = Object.freeze(['mobile-390x844', 'tablet-768x1024', 'desktop-1440x900']);
export const RESPONSIVE_VIEWPORTS = Object.freeze(EVIDENCE_VIEWPORTS.map((v) => v.id));

export function resolveViewport(id) {
  const found = EVIDENCE_VIEWPORTS.find((v) => v.id === id);
  if (!found) throw evidenceError('evidence_viewport_unknown', String(id));
  return found;
}
