/**
 * Canonical AgentSam Ecommerce CMS composition surface.
 *
 * The editor engine lives in this product (cms-editor/). This is the one public
 * CMS entry Local Studio consumes.
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
} from '../../cms-editor/frontend/src/index.ts';

export { createCmsThemeEditorAdapter } from '../theme-editor/cms-adapter.mjs';
export { createThemeEditorBridge, ThemeEditorCapabilityError } from '../theme-editor/bridge.mjs';
export { createThemeProjectAdapter, renderThemePage, validateThemeProject } from '../theme-editor/project.mjs';
export { ECOMMERCE_CMS_CAPABILITIES, assertEcommerceCmsAuthoringContract } from './capabilities.mjs';
