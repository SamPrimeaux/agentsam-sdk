/** Non-destructive per-clip color controls, shared by image/video/GIF preview. */
export const DEFAULT_COLOR_ADJUSTMENTS = Object.freeze({
  exposure: 0, contrast: 0, saturation: 100,
  highlights: 0, shadows: 0, temperature: 0, tint: 0,
  lift: 0, gamma: 0, gain: 0, hue: 0, luminance: 0,
});
export type CoProColorAdjustments = Partial<Record<keyof typeof DEFAULT_COLOR_ADJUSTMENTS, number>>;

/** Browser-safe approximation. The final video encoder must grade source pixels separately. */
export function colorAdjustmentPreviewFilter(adjustments?: CoProColorAdjustments): string {
  if (!adjustments) return "";
  const defaults = DEFAULT_COLOR_ADJUSTMENTS;
  const v = (key: keyof typeof defaults, min: number, max: number) => {
    const raw = Number(adjustments[key] ?? defaults[key]);
    return Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : defaults[key];
  };
  const exposure = v("exposure",-5,5), contrast = v("contrast",-100,100);
  const saturation = v("saturation",0,200), highlights = v("highlights",-100,100);
  const shadows = v("shadows",-100,100), temperature = v("temperature",-100,100);
  const tint = v("tint",-100,100), lift=v("lift",-100,100), gamma=v("gamma",-100,100);
  const gain=v("gain",-100,100), hue=v("hue",-180,180), luminance=v("luminance",-100,100);
  if ([exposure,contrast,highlights,shadows,temperature,tint,lift,gamma,gain,hue,luminance].every(x=>x===0) && saturation===100) return "";
  const brightness = Math.min(40,Math.max(.05,Math.pow(2,exposure) * (1 + shadows/350 + highlights/700 + lift/200 + luminance/200 + gain/250)));
  const contrastFactor = Math.max(.05,1 + contrast/100 + highlights/300 - shadows/500 + gain/300 - gamma/250);
  const saturationFactor = Math.max(0,saturation/100);
  const base = "brightness(" + brightness.toFixed(4) + ") contrast(" +
    contrastFactor.toFixed(4) + ") saturate(" + saturationFactor.toFixed(4) + ")";
  const warmth = Math.abs(temperature) / 250;
  const hueShift = hue + tint*.2 + temperature*.04;
  return base + (warmth ? " sepia("+warmth.toFixed(4)+")" : "") +
    (hueShift ? " hue-rotate("+hueShift.toFixed(2)+"deg)" : "");
}
