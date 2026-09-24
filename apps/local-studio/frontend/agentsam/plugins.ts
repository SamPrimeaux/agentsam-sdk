/** Authenticated projection of agentsam_plugins; credentials stay on the server. */
export interface ComposerPlugin {
  id: string;
  label: string;
  description: string;
  mention: string;
  iconUrl?: string;
  iconDarkUrl?: string;
  ready: boolean;
  status: string;
}
export async function loadComposerPlugins(signal?: AbortSignal): Promise<ComposerPlugin[]> {
  const response = await fetch('/api/connections', { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to view your plugins.' : 'Plugins could not load. Try again.');
  const body = await response.json();
  return projectComposerPlugins(body.plugins);
}

export function projectComposerPlugins(rows: unknown): ComposerPlugin[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && row.composer_visible === 1 && row.is_enabled === 1).map((row) => ({
    id: row.id, label: row.display_name, description: row.description || row.plugin_kind,
    mention: row.mention_aliases?.find((alias: string) => /^@[\w-]+$/.test(alias)) || `@${row.plugin_key}`,
    iconUrl: row.icon_url, iconDarkUrl: row.icon_dark_url,
    ready: (row.setup_status === 'connected' || (row.setup_status === 'configured' && ['none', 'workers_binding'].includes(row.auth_type))) && !['auth_error', 'disabled', 'unhealthy', 'unreachable'].includes(row.health_status),
    status: row.health_status === 'auth_error' ? 'Reconnect' : row.setup_status,
  }));
}
