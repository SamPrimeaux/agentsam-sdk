import { inflateSync } from 'node:zlib';

/** Chromium screenshot PNGs: 8-bit RGB/RGBA, non-interlaced. No image dependency. */
export function decodeScreenshotPng(bytes) {
  let offset = 8, width, height, channels; const parts = [];
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) throw new Error('screenshot_png_format_unsupported');
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === 'IDAT') parts.push(data);
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels, pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const pos = y * stride + x, a = x >= channels ? pixels[pos - channels] : 0, b = y ? pixels[pos - stride] : 0, c = y && x >= channels ? pixels[pos - stride - channels] : 0;
      const prediction = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? Math.floor((a + b) / 2) : type === 4 ? paeth(a, b, c) : NaN;
      if (!Number.isFinite(prediction)) throw new Error('screenshot_png_filter_unsupported');
      pixels[pos] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, channels, pixels };
}

export function changedPixelRatio(actualBytes, expectedBytes, channelTolerance = 16) {
  const a = decodeScreenshotPng(actualBytes), b = decodeScreenshotPng(expectedBytes);
  if (a.width !== b.width || a.height !== b.height) throw new Error('surface_viewport_mismatch');
  let changed = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    for (let c = 0; c < 3; c++) if (Math.abs(a.pixels[i * a.channels + c] - b.pixels[i * b.channels + c]) > channelTolerance) { changed++; break; }
  }
  return changed / (a.width * a.height);
}
