/**
 * Deterministic connected-border flat-background removal, ported from
 * FuelNFreetime StudioWorkspace.tsx. This is not AI subject segmentation.
 * Pure RGBA core: usable in browser Canvas, Node/Sharp, or a Worker decoder.
 */
export function removeConnectedBackgroundPixels(pixels, width, height, { tolerance = 42, maxPixels = 10_000_000 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > maxPixels) {
    throw new Error('invalid_or_oversized_image_dimensions');
  }
  if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new Error('expected_rgba_pixels');
  }
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new Error('invalid_background_tolerance');
  const count = width * height;
  const output = Uint8ClampedArray.from(pixels); // never mutate original
  let r = 0, g = 0, b = 0, samples = 0;
  const sample = (x, y) => {
    const o = (y * width + x) * 4;
    if (output[o + 3] < 16) return;
    r += output[o]; g += output[o + 1]; b += output[o + 2]; samples++;
  };
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));
  for (let x = 0; x < width; x += stepX) { sample(x, 0); sample(x, height - 1); }
  for (let y = 0; y < height; y += stepY) { sample(0, y); sample(width - 1, y); }
  if (!samples) return { pixels: output, removedPixels: 0, method: 'flat_connected' };
  const bg = [r / samples, g / samples, b / samples];
  const threshold = tolerance * tolerance * 3;
  const matches = (i) => {
    const o = i * 4;
    if (output[o + 3] < 16) return true;
    const dr = output[o] - bg[0], dg = output[o + 1] - bg[1], db = output[o + 2] - bg[2];
    return dr * dr + dg * dg + db * db <= threshold;
  };
  const seen = new Uint8Array(count), queue = new Int32Array(count);
  let head = 0, tail = 0;
  const enqueue = (i) => {
    if (i < 0 || i >= count || seen[i] || !matches(i)) return;
    seen[i] = 1; queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  let removedPixels = 0;
  while (head < tail) {
    const i = queue[head++], o = i * 4;
    if (output[o + 3]) { output[o + 3] = 0; removedPixels++; }
    const x = i % width, y = Math.floor(i / width);
    if (x) enqueue(i - 1);
    if (x + 1 < width) enqueue(i + 1);
    if (y) enqueue(i - width);
    if (y + 1 < height) enqueue(i + width);
  }
  return { pixels: output, removedPixels, method: 'flat_connected' };
}
