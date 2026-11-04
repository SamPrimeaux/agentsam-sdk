export function safeMerchUrl(value: string, allowAnchors?: boolean): string;
export function normalizeMerchHero(input?: Record<string, unknown>, defaults?: Record<string, unknown>): Record<string, unknown>;
export function parseMerchHero(json: string | Record<string, unknown>, defaults?: Record<string, unknown>): Record<string, unknown>;
export function serializeMerchHero(input: Record<string, unknown>, defaults?: Record<string, unknown>): string;
export function renderMerchHero(input?: Record<string, unknown>, defaults?: Record<string, unknown>): string;
