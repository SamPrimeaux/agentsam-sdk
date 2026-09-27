export {
  BLOCK_KINDS,
  SCROLL_MODES,
  SCROLL_PRESETS,
  createCopyBlock,
  createMediaBlock,
  createActionBlock,
  createCardsBlock,
  createDemoBlock,
  composeCardCollection,
  resolveRoute,
  validatePageContent,
} from './contracts/index.js';

export {
  SCENE_KINDS,
  SCENE_ORIGIN,
  getSceneKind,
  listSceneKinds,
  normalizeSection,
  createSection,
} from './scenes/index.js';

export {
  SHELL_KINDS,
  createShellContent,
  listShellKinds,
} from './shell/index.js';

export {
  shouldRenderBlock,
  filterRenderableBlocks,
} from './blocks/index.js';

export {
  VISUAL_KINDS,
  getVisual,
  listVisuals,
} from './visuals/index.js';

export {
  DEMO_ADAPTERS,
  getDemoAdapter,
  listDemoAdapters,
  createDemoHost,
} from './demos/index.js';

export {
  FOUNDATION_THEME,
  INNERANIMAL_THEME,
  AGENTSAM_THEME,
  AUTODIDACT_THEME,
  getTheme,
  listThemes,
  resolveTheme,
  themeToCssVars,
} from './themes/index.js';

export {
  createAgencyHomePreset,
  createWorkPreset,
  createProductPreset,
  createServicesPreset,
  createBrandStoryPreset,
  createPreset,
  listPresets,
  PRESET_BUILDERS,
} from './presets/index.js';

export {
  compilePage,
  resolveMedia,
  computeScrollProgress,
  stageAtProgress,
} from './runtime/compile.js';
