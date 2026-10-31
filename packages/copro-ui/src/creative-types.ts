export type CoProCreativeCategory = "template" | "animation" | "transition" | "overlay" | "treatment" | "graphic";

export type CoProCreativeAsset = {
  id: string;
  category: CoProCreativeCategory;
  name: string;
  durationUs?: number;
  previewUrl: string;
  previewFile?: string;
  source?: string;
  group?: string;
  aspectRatio?: string;
  description?: string;
};

export type CoProMotionSample = {
  x: number; y: number; scale: number; rotation: number; opacity: number;
  blur: number; clipInset: number; scaleX: number;
};

export type CoProMotionSampler = (
  id: string,
  timeUs: number,
  options?: { durationUs?: number; delayUs?: number; amplitude?: number },
) => CoProMotionSample;

export type CoProGraphicSample = { text: string; cursor?: boolean };
export type CoProGraphicSampler = (
  graphic: { id: string; durationUs?: number; sequence?: unknown; values?: number[]; decimals?: number },
  timeUs: number,
) => CoProGraphicSample | null;
