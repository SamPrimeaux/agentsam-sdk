import { useEffect, useState } from 'react';
import { SettingsThemeGallery } from '@inneranimalmedia/agentsam-settings';
import type { SettingsTheme } from '@inneranimalmedia/agentsam-settings/contracts';
import { localStudioSettingsHost } from '@/components/settings/localStudioSettingsHost';
import { listStudioThemes } from '@/lib/themes/inventory';
import { THEME_PROJECTS_CHANGED } from '@/lib/themes/projects';

export function ThemeStorePage() {
  const [themes, setThemes] = useState<SettingsTheme[]>([]);
  const [error, setError] = useState('');
  const load = () => { void listStudioThemes().then(setThemes, (error) => setError(error.message)); };
  useEffect(() => { load(); window.addEventListener(THEME_PROJECTS_CHANGED, load); return () => window.removeEventListener(THEME_PROJECTS_CHANGED, load); }, []);
  return <div className="h-full overflow-auto p-6"><div className="mx-auto max-w-7xl space-y-5"><header><h1 className="text-2xl font-medium">Theme Store</h1><p className="mt-2 text-muted-foreground">Preview packaged themes, revise their real pages, and manage your drafts.</p></header>{error && <p role="alert">{error}</p>}<SettingsThemeGallery themes={themes} host={localStudioSettingsHost} onChanged={load} /></div></div>;
}
