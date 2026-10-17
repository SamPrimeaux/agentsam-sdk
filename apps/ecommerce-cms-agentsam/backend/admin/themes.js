// Backwards-compatible admin entrypoint. The sole theme lifecycle authority is
// the canonical CMS artifact registry plus account-scoped CMS globals.
export {
  listStoreThemes,
  getStoreTheme,
  selectThemePreview,
  publishStoreTheme,
  setThemePublishReady,
} from '../cms/theme-authority.mjs';
