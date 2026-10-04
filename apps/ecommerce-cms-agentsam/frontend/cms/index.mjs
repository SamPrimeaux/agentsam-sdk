/**
 * Canonical AgentSam Ecommerce CMS composition surface.
 *
 * The packaged client-cms-editor is the reusable engine. This product owns the
 * higher-level ecommerce/theme composition and is the public entry Local Studio
 * should consume.
 */
export {
  CmsEditor,
  CmsHubPage,
  CmsDashboard,
  CmsSiteSwitcher,
  createHttpCmsAdapter,
  HttpCmsAdapter,
  useCmsEditor,
  useCmsEditorController,
} from '@inneranimalmedia/client-cms-editor';

export { createCmsThemeEditorAdapter } from '../theme-editor/cms-adapter.mjs';
export { createThemeEditorBridge, ThemeEditorCapabilityError } from '../theme-editor/bridge.mjs';
export { createThemeProjectAdapter, renderThemePage, validateThemeProject } from '../theme-editor/project.mjs';
export { ECOMMERCE_CMS_CAPABILITIES, assertEcommerceCmsAuthoringContract } from './capabilities.mjs';
