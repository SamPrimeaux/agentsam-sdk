/**
 * Precompiled jSquash WASM for Cloudflare Workers.
 * Worker isolates prohibit WebAssembly.instantiate(bytes). Wrangler compiles
 * imported .wasm files into WebAssembly.Module at deploy time.
 * The Node/Sharp processor is deliberately separate.
 */
import jpegDecWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import jpegEncWasm from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import webpDecWasm from "@jsquash/webp/codec/dec/webp_dec.wasm";
import webpEncWasm from "@jsquash/webp/codec/enc/webp_enc.wasm";
import pngWasm from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import resizeWasm from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm";

import { init as initJpegDec } from "@jsquash/jpeg/decode.js";
import { init as initJpegEnc } from "@jsquash/jpeg/encode.js";
import { init as initWebpDec } from "@jsquash/webp/decode.js";
import { init as initWebpEnc } from "@jsquash/webp/encode.js";
import { init as initPngDec } from "@jsquash/png/decode.js";
import { init as initPngEnc } from "@jsquash/png/encode.js";
import { initResize } from "@jsquash/resize";

let ready;
export function prepareWorkerCodecs() {
  // One startup per isolate, with shared failure propagated to the job handler.
  if (!ready) ready = Promise.all([
    initJpegDec(jpegDecWasm), initJpegEnc(jpegEncWasm),
    initWebpDec(webpDecWasm), initWebpEnc(webpEncWasm),
    initPngDec(pngWasm), initPngEnc(pngWasm),
    initResize(resizeWasm),
  ]).then(() => undefined);
  return ready;
}
