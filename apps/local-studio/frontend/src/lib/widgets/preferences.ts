import { BUILTIN_WIDGET_DEFINITIONS } from '@inneranimalmedia/agentsam-workbench/widgets';

export const LOCAL_STUDIO_WIDGET_PREFERENCES_KEY = 'agentsam.local-studio.widgets.v1';
export const LOCAL_STUDIO_WIDGETS_CHANGED_EVENT = 'agentsam:widgets-changed';

export type LocalStudioWidgetPreference = {
  visible: boolean;
};

type WidgetPreferenceMap = Record<string, LocalStudioWidgetPreference>;

function readPreferenceMap(): WidgetPreferenceMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STUDIO_WIDGET_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as WidgetPreferenceMap : {};
  } catch {
    return {};
  }
}

function writePreferenceMap(next: WidgetPreferenceMap) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_STUDIO_WIDGET_PREFERENCES_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(LOCAL_STUDIO_WIDGETS_CHANGED_EVENT));
}

export function listLocalStudioWidgets() {
  const preferences = readPreferenceMap();
  return BUILTIN_WIDGET_DEFINITIONS.map((definition) => ({
    ...definition,
    visible: preferences[definition.id]?.visible !== false,
    removable: false,
    source: 'Built in',
    preferenceScope: 'This device',
  }));
}

export function setLocalStudioWidgetVisible(id: string, visible: boolean) {
  if (!BUILTIN_WIDGET_DEFINITIONS.some((definition) => definition.id === id)) {
    throw new Error('widget_not_found');
  }
  const preferences = readPreferenceMap();
  preferences[id] = { visible };
  writePreferenceMap(preferences);
}

export function subscribeLocalStudioWidgets(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCAL_STUDIO_WIDGETS_CHANGED_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(LOCAL_STUDIO_WIDGETS_CHANGED_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
