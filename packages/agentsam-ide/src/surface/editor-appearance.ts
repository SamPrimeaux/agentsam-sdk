/** Device-local presentation settings for this workspace. Host files remain authoritative. */
export const EDITOR_FONTS = [
  { id: 'system', label: 'System Mono', family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { id: 'menlo', label: 'Menlo', family: 'Menlo, Monaco, Consolas, monospace' },
  { id: 'plex', label: 'IBM Plex Mono', family: "'IBM Plex Mono', ui-monospace, Menlo, monospace" },
  { id: 'jetbrains', label: 'JetBrains Mono', family: "'JetBrains Mono', ui-monospace, Menlo, monospace" },
] as const;

export type EditorFontId = (typeof EDITOR_FONTS)[number]['id'];
export type EditorAppearance = {
  fontId: EditorFontId;
  fontSize: number;
  minimap: boolean;
  wordWrap: boolean;
};
export const DEFAULT_EDITOR_APPEARANCE: EditorAppearance = {
  fontId: 'system', fontSize: 14, minimap: false, wordWrap: true,
};

export function normalizeEditorAppearance(input: unknown): EditorAppearance {
  const item = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Partial<EditorAppearance> : {};
  return {
    fontId: EDITOR_FONTS.some(font => font.id === item.fontId)
      ? item.fontId as EditorFontId : DEFAULT_EDITOR_APPEARANCE.fontId,
    fontSize: typeof item.fontSize === 'number' && Number.isFinite(item.fontSize)
      ? Math.min(24, Math.max(11, Math.round(item.fontSize))) : DEFAULT_EDITOR_APPEARANCE.fontSize,
    minimap: typeof item.minimap === 'boolean' ? item.minimap : DEFAULT_EDITOR_APPEARANCE.minimap,
    wordWrap: typeof item.wordWrap === 'boolean' ? item.wordWrap : DEFAULT_EDITOR_APPEARANCE.wordWrap,
  };
}
