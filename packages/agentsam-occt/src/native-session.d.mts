export interface OcctSession {
  request(input: Record<string, unknown>): Promise<any>;
  close(): void;
}
export function createOcctSession(options: { binary: string; timeoutMs?: number }): OcctSession;
