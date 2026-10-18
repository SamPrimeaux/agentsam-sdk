/**
 * Worker-safe raster optimize using @jsquash (no Sharp / no Node native).
 * Used by the production queue consumer. CLI still uses Sharp via image-optimize.js.
 */

import decodeJpeg from "@jsquash/jpeg/decode.js";
import encodeJpeg from "@jsquash/jpeg/encode.js";
import decodePng from "@jsquash/png/decode.js";
import encodePng from "@jsquash/png/encode.js";
import decodeWebp from "@jsquash/webp/decode.js";
import encodeWebp from "@jsquash/webp/encode.js";
import resize from "@jsquash/resize";
import { prepareWorkerCodecs } from "./worker-codecs-wasm.js";

/**
 * @param {ArrayBuffer} bytes
 * @param {string} contentType
 * @param {{ maxWidth?: number, quality?: number, preferWebp?: boolean, keepAlpha?: boolean }} opts
 */
export async function optimizeRasterBuffer(bytes, contentType, opts = {}) {
  await prepareWorkerCodecs();
  const maxWidth = opts.maxWidth ?? 1600;
  const quality = opts.quality ?? 82;
  const preferWebp = opts.preferWebp !== false;
  const ct = String(contentType || "").toLowerCase();

  let imageData;
  if (ct.includes("png") || ct.includes("image/png")) {
    imageData = await decodePng(bytes);
  } else if (ct.includes("webp")) {
    imageData = await decodeWebp(bytes);
  } else {
    imageData = await decodeJpeg(bytes);
  }

  const srcW = imageData.width;
  const srcH = imageData.height;
  let out = imageData;
  if (srcW > maxWidth) {
    const height = Math.round((srcH * maxWidth) / srcW);
    out = await resize(imageData, { width: maxWidth, height, method: "triangle" });
  }

  const hasAlpha = opts.keepAlpha === true;
  if (preferWebp && !hasAlpha) {
    const encoded = await encodeWebp(out, { quality });
    return {
      bytes: encoded,
      contentType: "image/webp",
      ext: "webp",
      width: out.width,
      height: out.height,
      source_width: srcW,
      source_height: srcH,
    };
  }

  if (hasAlpha || ct.includes("png")) {
    const encoded = await encodePng(out);
    return {
      bytes: encoded,
      contentType: "image/png",
      ext: "png",
      width: out.width,
      height: out.height,
      source_width: srcW,
      source_height: srcH,
    };
  }

  const encoded = await encodeJpeg(out, { quality });
  return {
    bytes: encoded,
    contentType: "image/jpeg",
    ext: "jpg",
    width: out.width,
    height: out.height,
    source_width: srcW,
    source_height: srcH,
  };
}
