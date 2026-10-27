/** Canonical typed public provider interface for Node and Cloudflare Workers. */
export * from '../dist/client.js';
import type { CompletefulClient } from '../dist/client.js';
export declare const COMPLETEFUL_TOOL_DEFINITIONS: readonly Record<string, unknown>[];
export declare function getCompletefulToolDefinition(toolKey: string): Record<string, unknown> | undefined;
export declare function executeCompletefulProviderTool(
  client: CompletefulClient,
  toolKey: string,
  input?: Record<string, unknown>,
  invocation?: Record<string, unknown>,
): Promise<Record<string, unknown>>;
export declare function createCompletefulProviderAdapter(client: CompletefulClient): {
  providerKey: 'completeful';
  listTools(): Array<Record<string, unknown>>;
  invoke(invocation: { toolKey: string; input: Record<string, unknown>; [key: string]: unknown }): Promise<Record<string, unknown>>;
};
export declare const COMPLETEFUL_WEBHOOK_TOLERANCE_SECONDS: number;
export declare function computeCompletefulWebhookSignature(secret: string, timestamp: number, rawBody: string): Promise<string>;
export declare function verifyCompletefulWebhook(options: {
  rawBody: string; signatureHeader: string; secret: string; nowSeconds?: number;
}): Promise<{ ok: boolean; [key: string]: unknown }>;
export declare function normalizeCompletefulEvent(
  event: Record<string, unknown>, context?: Record<string, unknown>
): Record<string, unknown>;
