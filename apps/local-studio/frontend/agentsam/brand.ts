import type { NavBrand } from '@inneranimalmedia/agentsam-nav';

/**
 * Local Studio shell branding uses the same canonical AgentSam mark that the
 * native Tauri app-icon compositor consumes. The public variants differ only
 * by fill so the mark stays legible on dark and light shell chrome.
 */
export const brand: NavBrand = {
  name: 'AgentSam',
  home: '/agentsam',
  logo: '/brand/agentsam-mark-on-dark.svg',
  lightLogo: '/brand/agentsam-mark-on-light.svg',
};
