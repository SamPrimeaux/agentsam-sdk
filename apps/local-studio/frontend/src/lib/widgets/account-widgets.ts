/** Local Studio host adapter for the portable Workbench widget catalog and D1 state. */
export type AccountWidget = {
  key: string;
  title: string;
  ownerPackage: string | null;
  description: string;
  category: string;
  icon: string | null;
  componentKey: string | null;
  availability: 'ready' | 'concept';
  available: boolean;
  sizes: string[];
  installed: boolean;
  installationId: string | null;
  pinned: boolean;
  hidden: boolean;
  sizeClass: string;
  orderIndex: number;
  configuration: Record<string, unknown>;
};

export type AccountWidgetSurface = 'agentsam_stage' | 'widgets_home';
type Patch = Partial<Pick<AccountWidget, 'pinned' | 'hidden' | 'orderIndex'>> & {
  sizeClass?: string;
  configuration?: Record<string, unknown>;
};

async function widgetRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', data?: object, surface: AccountWidgetSurface = 'agentsam_stage'): Promise<T> {
  const response = await fetch(method === 'GET' ? '/api/widgets?surface=' + encodeURIComponent(surface) : '/api/widgets', {
    method,
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(data ? { 'content-type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'widgets_unavailable');
  }
  if (method !== 'GET' && typeof window !== 'undefined')
    window.dispatchEvent(new Event('agentsam:widgets-changed'));
  return payload as T;
}

export async function loadAccountWidgets(surface: AccountWidgetSurface = 'agentsam_stage'): Promise<AccountWidget[]> {
  const payload = await widgetRequest<{ok: true; widgets: AccountWidget[]}>('GET', undefined, surface);
  return payload.widgets;
}
export async function installAccountWidget(key: string, surface: AccountWidgetSurface = 'agentsam_stage') {
  await widgetRequest('POST', { key, surface });
}
export async function updateAccountWidget(key: string, patch: Patch, surface: AccountWidgetSurface = 'agentsam_stage') {
  await widgetRequest('PATCH', { key, surface, ...patch });
}
export async function uninstallAccountWidget(key: string, surface: AccountWidgetSurface = 'agentsam_stage') {
  await widgetRequest('DELETE', { key, surface });
}
