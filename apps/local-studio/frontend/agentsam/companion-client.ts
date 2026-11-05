import {
  emitTauriEvent,
  getDesktopWorkspaceContext,
  invokeStudioService,
  isPackagedDesktop,
  resolveDesktopStudioAccountId,
} from '@/lib/desktop/tauri';
import { DEFAULT_COMPANION_SETTINGS, type CompanionSettings } from './companions';

type CompanionResponse = { ok?: boolean; error?: string; settings?: CompanionSettings };

export async function broadcastCompanionSettings(settings: CompanionSettings): Promise<void> {
  if (isPackagedDesktop()) await emitTauriEvent('agentsam:companions:changed', settings).catch(() => {});
}

async function companionRequest(method: 'GET' | 'PUT', settings?: CompanionSettings): Promise<CompanionSettings> {
  let response: CompanionResponse;
  let status: number;
  if (isPackagedDesktop()) {
    // The desktop build uses the same authenticated Worker API through its native settings bridge.
    const result = await invokeStudioService({
      operation: 'settings',
      account_id: await resolveDesktopStudioAccountId(),
      path: '/api/settings/companions',
      method,
      ...(settings ? { body: settings } : {}),
    });
    status = result.status;
    try { response = JSON.parse(result.body || '{}') as CompanionResponse; }
    catch { throw new Error('companion_settings_invalid_response'); }
  } else {
    const result = await fetch('/api/settings/companions', {
      method,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(settings ? { 'content-type': 'application/json' } : {}) },
      body: settings ? JSON.stringify(settings) : undefined,
    });
    status = result.status;
    response = await result.json().catch(() => ({ ok: false, error: 'companion_settings_invalid_response' }));
  }
  if (status >= 400 || response.ok !== true || !response.settings) {
    throw new Error(response.error || `companion_settings_failed_${status}`);
  }
  return response.settings;
}

export async function loadCompanionSettings(): Promise<CompanionSettings> {
  try { return await companionRequest('GET'); }
  catch (error) {
    // A local desktop without a signed-in account can still render the default Geaux companion.
    const workspace = isPackagedDesktop() ? await getDesktopWorkspaceContext().catch(() => null) : null;
    if (workspace) return DEFAULT_COMPANION_SETTINGS;
    throw error;
  }
}

export function saveCompanionSettings(settings: CompanionSettings): Promise<CompanionSettings> {
  return companionRequest('PUT', settings);
}
