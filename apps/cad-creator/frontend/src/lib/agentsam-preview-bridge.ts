/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const AGENTSAM_PREVIEW_BRIDGE_CHANNEL = 'agentsam-preview-bridge' as const;
export const AGENTSAM_PREVIEW_BRIDGE_VERSION = 1 as const;
export const PREVIEW_BRIDGE_CHANNEL = 'grok-preview-bridge' as const;
export const PREVIEW_BRIDGE_VERSION = 1 as const;

export interface CadPreviewGuestBridgeOptions {
  activeWorkspace?: string;
  onSelectWorkspace?: (workspaceId: any) => void;
  onSetTheme?: (isDark: boolean) => void;
}

/**
 * Install the guest side of the AgentSam Preview Bridge in CAD Creator.
 * Connects CAD Creator to Local Studio or IAM host shells.
 */
export function installCadPreviewGuestBridge(options: CadPreviewGuestBridgeOptions = {}): () => void {
  if (typeof window === 'undefined' || window.parent === window) {
    return () => {};
  }

  const post = (msg: { type: string; [key: string]: unknown }) => {
    try {
      window.parent.postMessage(
        { ...msg, channel: AGENTSAM_PREVIEW_BRIDGE_CHANNEL, version: AGENTSAM_PREVIEW_BRIDGE_VERSION },
        '*'
      );
      window.parent.postMessage(
        { ...msg, channel: PREVIEW_BRIDGE_CHANNEL, version: PREVIEW_BRIDGE_VERSION },
        '*'
      );
    } catch {
      // ignore postMessage error
    }
  };

  const announceReady = () => {
    post({
      type: 'ready',
      appId: 'cad-creator',
      workspaces: ['plan', 'model', 'parametric', 'robotics', 'render'],
      activeWorkspace: options.activeWorkspace || 'plan'
    });
  };

  const handleMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (
      data.channel !== AGENTSAM_PREVIEW_BRIDGE_CHANNEL &&
      data.channel !== PREVIEW_BRIDGE_CHANNEL
    ) {
      return;
    }

    if (data.type === 'hello') {
      announceReady();
    } else if (data.type === 'set-workspace' && typeof data.workspace === 'string') {
      options.onSelectWorkspace?.(data.workspace);
    } else if (data.type === 'set-theme') {
      options.onSetTheme?.(data.theme === 'dark');
    }
  };

  window.addEventListener('message', handleMessage);
  announceReady();

  return () => {
    window.removeEventListener('message', handleMessage);
  };
}
