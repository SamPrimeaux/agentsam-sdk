export const miniAgentSamTokens: { readonly accent: string; readonly icon: string };
export interface MiniAgentSam {
  select(resource: unknown, bounds: () => DOMRect | null): void;
  setIcon(url?: string): boolean;
  reposition(): void;
  close(): void;
  destroy(): void;
}
export function createMiniAgentSam(host: {
  preferAbove?: boolean;
  iconUrl?: string;
  positionBounds?: () => Pick<DOMRect, "left" | "right" | "top" | "bottom"> | null;
  resultStatus?: string;
  capabilities?: { list: () => unknown[] | Promise<unknown[]> };
  send: (args: { prompt: string; resource: unknown; capabilities: string[]; attachments: unknown[]; signal: AbortSignal; onPhase: (event: unknown) => void }) => Promise<{ reply: string }>;
  onResult?: (result: { reply: string }) => void;
  onClose?: () => void;
}): MiniAgentSam;
