export type StudioModelSelection = {
  provider: string;
  model_id: string;
};

export type StudioInventoryModel = {
  provider: string;
  model_id: string;
  model_key?: string | null;
  label: string;
  availability?: string;
  context_window?: number | null;
  reasoning_efforts?: string[];
  capabilities?: Record<string, unknown>;
  hint?: string;
};

/** @deprecated Static catalog removed — inventory API is the authority. Kept empty for type migration. */
export const STUDIO_MODELS: StudioInventoryModel[] = [];

export const DEFAULT_SELECTION: StudioModelSelection = {
  provider: "",
  model_id: "",
};

export function selectionKey(sel: StudioModelSelection | null | undefined): string {
  if (!sel?.provider || !sel?.model_id) return "";
  return `${sel.provider}:${sel.model_id}`;
}

export function parseSelectionKey(value: string | null | undefined): StudioModelSelection | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes(":")) {
    const idx = raw.indexOf(":");
    return { provider: raw.slice(0, idx), model_id: raw.slice(idx + 1) };
  }
  // Legacy bare model ids are intentionally rejected for chat — force re-pick.
  return null;
}

export function shortLabel(model: StudioInventoryModel): string {
  const id = model.model_id || "";
  if (id.length <= 12) return id;
  return id.slice(0, 10) + "…";
}
