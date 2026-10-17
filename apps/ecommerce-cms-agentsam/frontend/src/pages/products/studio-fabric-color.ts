/**
 * Best-effort garment swatch from a VERIFIED selected-variant photo.
 * Never infer a garment color from a print-location artboard image:
 * artboards are often a single black template shared across all variants.
 */
export function fabricColorFromImagePixels(
  data: Uint8ClampedArray, width: number, height: number,
): string | null {
  if (!(width >= 4 && height >= 4) || data.length < width * height * 4) return null;
  const channels: number[][] = [[], [], []];
  // Central torso of standard catalog garment photos; avoid white border,
  // exposed arms, neckline and faces. Median is robust to small design details.
  const startX = Math.floor(width * 0.43);
  const endX = Math.ceil(width * 0.57);
  const startY = Math.floor(height * 0.43);
  const endY = Math.ceil(height * 0.66);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 230) continue;
      for (let channel = 0; channel < 3; channel += 1) channels[channel].push(data[i + channel]);
    }
  }
  if (channels[0].length < 8) return null;
  const rgb = channels.map((values) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  return "#" + rgb.map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function validProviderFabricHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (!/^(?:[a-f\d]{6}|[a-f\d]{3})$/i.test(hex)) return null;
  return "#" + (hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex).toLowerCase();
}
