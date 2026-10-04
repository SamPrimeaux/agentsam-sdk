import type { NavBrand } from '@inneranimalmedia/agentsam-nav';

/**
 * Local Studio uses the same canonical artwork as the native Tauri bundle.
 * The PNG is packaged into frontend/public so hosted and desktop builds resolve
 * identical bytes without a network dependency.
 */
export const brand: NavBrand = {
  name: 'AgentSam',
  home: '/agentsam',
  logo: '/brand/agentsam-local-studio-icon.png',
  lightLogo: '/brand/agentsam-local-studio-icon.png',
};
