export const ANIMATIONS: Array<{ id: string; name: string; family: string; mode: string; durationUs: number; schema: string; provenance: string }>;
export function sampleAnimation(id: string, timeUs: number, options?: { durationUs?: number; delayUs?: number; amplitude?: number }): { x: number; y: number; scale: number; rotation: number; opacity: number; blur: number; clipInset: number; scaleX: number };

export function createTypewriterEvents(texts: string | string[], options?: { typeUs?: number; deleteUs?: number; holdUs?: number; gapUs?: number; loop?: boolean }): { events: Array<{ timeUs: number; text: string }>; durationUs: number; loop: boolean };
export function sampleTypewriter(sequence: { events: Array<{ timeUs: number; text: string }>; durationUs: number; loop: boolean }, timeUs: number, options?: { blinkUs?: number }): { text: string; cursor: boolean };
export function sampleCounter(values: number[], timeUs: number, options?: { durationUs?: number; decimals?: number }): { value: number; text: string };
