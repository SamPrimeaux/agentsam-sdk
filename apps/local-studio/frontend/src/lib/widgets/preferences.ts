import { WIDGET_GALLERY_DEFINITIONS } from '@inneranimalmedia/agentsam-workbench/widgets';

/**
 * Backward-compatible metadata projection for the curated Workbench gallery.
 * Installation, layout and preferences are no longer stored in localStorage:
 * the authenticated host API and existing D1 widget tables own those values.
 */
export const LOCAL_STUDIO_WIDGETS_CHANGED_EVENT = 'agentsam:widgets-changed';

export function listLocalStudioWidgets() {
  return WIDGET_GALLERY_DEFINITIONS.map(definition => ({
    ...definition,
    visible: false,
    removable: false,
    source: definition.availability === 'ready' ? 'Workbench' : 'Concept · preview only',
    preferenceScope: definition.availability === 'ready' ? 'Your account · New Tab' : 'Not installed',
    deeplink: undefined,
  }));
}

/** UI refresh notification only; never an installation authority. */
export function subscribeLocalStudioWidgets(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCAL_STUDIO_WIDGETS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(LOCAL_STUDIO_WIDGETS_CHANGED_EVENT, callback);
}
