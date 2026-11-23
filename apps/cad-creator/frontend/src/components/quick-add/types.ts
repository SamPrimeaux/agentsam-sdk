/** Gallery tab. Objects are things you place; Scenes are whole compositions you start from. */
export type QuickAddTab = 'objects' | 'scenes';

/**
 * One catalog entry. `kind` is the studio_templates.resource_kind (what the thing is),
 * `category` is the sidebar grouping, and the file format never appears here: it is a
 * property of the payload, not a way to browse.
 */
export interface QuickAddItem {
  id: string;
  tab: QuickAddTab;
  kind: string;
  category: string;
  title: string;
  description?: string;
  pack?: string | null;
  app?: string;
  /** Free-form per-kind data (stock fixtures carry type/w/d/h/color). */
  specs?: Record<string, unknown>;
  /** Image preview. When absent the tile renders a generated preview. */
  previewUrl?: string | null;
  /** Stable key of the payload the host resolves (template slug for scenes). */
  ref?: string | null;
  /** Authenticated R2-backed payload, not yet a native editable BIM project. */
  payloadUrl?: string | null;
  renderer?: string | null;
}

export type QuickAddSource = 'catalog' | 'builtin';
