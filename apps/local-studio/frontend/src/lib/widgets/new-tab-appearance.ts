/**
 * Account-backed New Tab presentation, stored in the existing
 * agentsam_user_ui_preferences.new_tab JSON namespace.
 * This is not a separate registry or a localStorage authority.
 */
export type NewTabWallpaper = 'default' | 'aurora' | 'dusk' | 'forest' | 'graphite' | 'photo';
export type NewTabAppearance = {wallpaper: NewTabWallpaper; imageUrl: string | null};
export const DEFAULT_NEW_TAB_APPEARANCE: NewTabAppearance = {wallpaper:'default',imageUrl:null};

async function requestAppearance(method: 'GET' | 'PUT', body?: NewTabAppearance): Promise<NewTabAppearance> {
  const response=await fetch('/api/settings/new-tab',{
    method, credentials:'same-origin',
    headers: { accept:'application/json', ...(body ? {'content-type':'application/json'}:{}) },
    ...(body ? {body:JSON.stringify(body)}:{}),
  });
  const data=await response.json().catch(()=>null);
  if (!response.ok || !data?.ok || !data.appearance) throw Error(
    typeof data?.error==='string' ? data.error : 'new_tab_preferences_unavailable'
  );
  return data.appearance as NewTabAppearance;
}
export const loadNewTabAppearance=()=>requestAppearance('GET');
export const saveNewTabAppearance=(appearance:NewTabAppearance)=>requestAppearance('PUT',appearance);
