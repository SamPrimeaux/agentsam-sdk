export const miniAgentSamTokens: { readonly accent: string; readonly icon: string };
export interface MiniAgentSam {
  select(resource: unknown, bounds: () => DOMRect | null): void;
  close(): void;
  destroy(): void;
}
export function createMiniAgentSam(host: {
  preferAbove?: boolean;
  resultStatus?: string;
  capabilities?: { list: () => unknown[] };
  send: (args: { prompt: string; resource: unknown; capabilities: string[]; attachments: unknown[]; signal: AbortSignal; onPhase: (event: unknown) => void }) => Promise<{ reply: string }>;
  onResult?: (result: { reply: string }) => void;
  onClose?: () => void;
}): MiniAgentSam;
