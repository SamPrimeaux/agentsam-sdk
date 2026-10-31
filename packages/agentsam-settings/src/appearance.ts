import { useEffect, useState } from 'react';
export const SHELL_APPEARANCE_STORAGE_ID = "agentsam-shell-appearance-v1";
export type ShellAppearancePreference = {
  theme: "dark" | "light" | "system";
  accent: string;
};

export function readShellAppearancePreference(
  storage?: Pick<Storage, "getItem">,
): ShellAppearancePreference | null {
  const source =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!source) return null;
  try {
    const value = source.getItem(SHELL_APPEARANCE_STORAGE_ID);
    if (!value) return null;
    const raw = JSON.parse(value) as Partial<ShellAppearancePreference>;
    if (raw.theme !== "dark" && raw.theme !== "light" && raw.theme !== "system") return null;
    if (typeof raw.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(raw.accent)) return null;
    return { theme: raw.theme, accent: raw.accent };
  } catch {
    return null;
  }
}

/** One Settings preference contract for hosts and independently bundled applications. */
export function resolveShellAppearance(preference:ShellAppearancePreference | null,systemLight:boolean):{theme:'light'|'dark';accent:string} {
  const value=preference ?? {theme:'system',accent:'#2563EB'};
  return {theme:value.theme==='system'?(systemLight?'light':'dark'):value.theme,accent:value.accent};
}
export function useShellAppearance() {
  const [appearance,setAppearance] = useState(() => resolveShellAppearance(readShellAppearancePreference(),typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches));
  useEffect(() => observeShellAppearance(setAppearance),[]);
  return appearance;
}

/** Observe the canonical preference from non-React installed applications, too. */
export function observeShellAppearance(apply:(appearance:{theme:'light'|'dark';accent:string})=>void) {
  const media=window.matchMedia('(prefers-color-scheme: light)');
  const update=()=>apply(resolveShellAppearance(readShellAppearancePreference(),media.matches));
  update();window.addEventListener('agentsam:shell-appearance',update);window.addEventListener('storage',update);media.addEventListener('change',update);
  return ()=>{window.removeEventListener('agentsam:shell-appearance',update);window.removeEventListener('storage',update);media.removeEventListener('change',update);};
}
export function shellAccentForeground(accent:string) {
  if(!/^#[0-9a-f]{6}$/i.test(accent))return '#ffffff';
  const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  return (luminance+.05)/.05 >= 1.05/(luminance+.05) ? '#000000' : '#ffffff';
}
