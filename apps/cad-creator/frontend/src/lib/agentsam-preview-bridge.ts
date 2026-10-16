/** @license SPDX-License-Identifier: Apache-2.0 */
export const AGENTSAM_PREVIEW_BRIDGE_CHANNEL = 'agentsam-preview-bridge' as const;
export const AGENTSAM_PREVIEW_BRIDGE_VERSION = 1 as const;
export const PREVIEW_BRIDGE_CHANNEL = 'grok-preview-bridge' as const;
export const PREVIEW_BRIDGE_VERSION = 1 as const;
export const CAD_WORKSPACES = ['plan', 'model', 'parametric', 'robotics', 'render'] as const;

export interface CadSelectionContext {
  source: 'cad-creator'; workspace: string; project_id: string; revision: number;
  object: { id: string; type: string; label: string; units: 'in' };
}
/** Host owns conversation + write authority. Guest may only *request*; never privileged writes. */
export type CadOutbound =
  | { type: 'ready'; appId: 'cad-creator'; workspaces: string[]; activeWorkspace: string }
  | { type: 'cad.selection'; selection: CadSelectionContext }
  | { type: 'assistant.request'; request_id: string; prompt: string; selection: CadSelectionContext | null }
  | { type: 'cad.proposal'; proposal: { summary: string; tool: 'design_apply_operation'; args: Record<string, unknown> } };

const defaultOrigins = () => [window.location.origin, 'http://127.0.0.1:3000', 'http://localhost:3000', 'https://agentsam.inneranimalmedia.com'];
export function isAllowedBridgeMessage(event: MessageEvent, allowedOrigins: string[]): boolean {
  if (event.source !== window.parent) return false;
  if (!allowedOrigins.includes(event.origin)) return false;
  const d: any = event.data;
  return !!d && typeof d === 'object' && (d.channel === AGENTSAM_PREVIEW_BRIDGE_CHANNEL || d.channel === PREVIEW_BRIDGE_CHANNEL) && d.version === 1;
}

export interface CadPreviewGuestBridgeOptions {
  activeWorkspace?: string; allowedOrigins?: string[];
  onSelectWorkspace?: (workspaceId: string) => void;
  onSetTheme?: (isDark: boolean) => void;
  onAssistantResponse?: (requestId: string, text: string) => void;
}

export function installCadPreviewGuestBridge(options: CadPreviewGuestBridgeOptions = {}): { post: (m: CadOutbound) => void; dispose: () => void } {
  const noop = { post: () => {}, dispose: () => {} };
  if (typeof window === 'undefined' || window.parent === window) return noop;
  const origins = options.allowedOrigins?.length ? options.allowedOrigins : defaultOrigins();
  const targetOrigin = origins.includes(window.location.origin) ? window.location.origin : origins[0];
  const post = (msg: CadOutbound) => {
    try { window.parent.postMessage({ ...msg, channel: AGENTSAM_PREVIEW_BRIDGE_CHANNEL, version: AGENTSAM_PREVIEW_BRIDGE_VERSION }, targetOrigin); } catch { /* host unreachable: caller must surface failure */ }
  };
  const announceReady = () => post({ type: 'ready', appId: 'cad-creator', workspaces: [...CAD_WORKSPACES], activeWorkspace: options.activeWorkspace || 'plan' });
  const handleMessage = (event: MessageEvent) => {
    if (!isAllowedBridgeMessage(event, origins)) return;
    const data: any = event.data;
    if (data.type === 'hello') announceReady();
    else if (data.type === 'set-workspace' && CAD_WORKSPACES.includes(data.workspace)) options.onSelectWorkspace?.(data.workspace);
    else if (data.type === 'set-theme') options.onSetTheme?.(data.theme === 'dark');
    else if (data.type === 'assistant.response' && typeof data.request_id === 'string' && typeof data.text === 'string') options.onAssistantResponse?.(data.request_id, data.text);
    // Any other inbound type is ignored: iframe messages never grant write authority.
  };
  window.addEventListener('message', handleMessage);
  announceReady();
  return { post, dispose: () => window.removeEventListener('message', handleMessage) };
}
