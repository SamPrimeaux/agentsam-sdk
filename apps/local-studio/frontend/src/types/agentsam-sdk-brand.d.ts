declare module "@inneranimalmedia/agentsam-brand" {
  export interface OptimizeResult {
    path: string;
    format: string;
    bytes: number;
    width: number | null;
    height: number | null;
    sha256?: string;
    content_type?: string;
    processor: string;
    options?: Record<string, unknown>;
  }

  export interface OptimizeOptions {
    format?: string;
    quality?: number;
    lossless?: boolean;
    cqLevel?: number;
    outPath: string;
    processor?: string;
  }

  export function optimizeWithScheduler(
    input: Buffer | Uint8Array | string,
    options: OptimizeOptions,
  ): Promise<OptimizeResult>;

  export function encodeWithScheduler(
    input: Buffer | Uint8Array | string,
    options: OptimizeOptions,
  ): Promise<OptimizeResult>;
}
