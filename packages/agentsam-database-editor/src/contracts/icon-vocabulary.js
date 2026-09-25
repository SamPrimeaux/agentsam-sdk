/**
 * Re-export protocol icon registry — Database Editor + CLI share one vocabulary.
 */
export {
  AGENTSAM_ICON_KEYS,
  ICON_ALIASES,
  ICON_CATALOG,
  CLI_ICON_GLYPHS,
  normalizeIconKey,
  isAgentsamIconKey,
  resolveCliIconGlyph,
  resolveIconMeta,
  createIconRenderer,
} from '../../../protocol/ui/icon-registry.mjs';

/** @deprecated use resolveCliIconGlyph */
export { resolveCliIconGlyph as resolveTerminalIcon } from '../../../protocol/ui/icon-registry.mjs';
