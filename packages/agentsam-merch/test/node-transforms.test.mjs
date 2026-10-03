import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  detectNodeTransformCapabilities,
  inspectRaster,
  normalizeRaster,
  traceRasterToSvg,
} from "../src/node/index.js";
import { verifyVectorizationResult } from "../src/index.js";

const execFileAsync = promisify(execFile);

async function sharpModule() {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch {
    return null;
  }
}

async function makeTransparentFixture(sharp) {
  const base = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 240,
            height: 180,
            channels: 4,
            background: { r: 20, g: 20, b: 20, alpha: 1 },
          },
        },
        left: 80,
        top: 60,
      },
    ])
    .png()
    .toBuffer();
  return base;
}

test("node raster inspector measures visible alpha bounds", async (t) => {
  const sharp = await sharpModule();
  if (!sharp) return t.skip("sharp unavailable");
  const source = await makeTransparentFixture(sharp);
  const descriptor = await inspectRaster(source, { sharp });
  assert.equal(descriptor.widthPx, 400);
  assert.equal(descriptor.heightPx, 300);
  assert.equal(descriptor.contentWidthPx, 240);
  assert.equal(descriptor.contentHeightPx, 180);
  assert.equal(descriptor.transparentBorderDetected, true);
});

test("node raster normalizer trims alpha without upscaling", async (t) => {
  const sharp = await sharpModule();
  if (!sharp) return t.skip("sharp unavailable");
  const source = await makeTransparentFixture(sharp);
  const result = await normalizeRaster(source, {
    sharp,
    format: "png",
    operations: [
      { id: "trim_alpha", params: {} },
      { id: "normalize_color_space", params: { colorSpace: "srgb" } },
    ],
  });
  assert.equal(result.descriptor.widthPx, 240);
  assert.equal(result.descriptor.heightPx, 180);
  assert.equal(result.descriptor.colorSpace, "srgb");
});

test("installed potrace produces a verifiable monochrome SVG derivative", async (t) => {
  const sharp = await sharpModule();
  if (!sharp) return t.skip("sharp unavailable");
  try {
    await execFileAsync("potrace", ["--version"]);
  } catch {
    return t.skip("potrace unavailable");
  }

  const source = await sharp({
    create: {
      width: 300,
      height: 180,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 180,
            height: 90,
            channels: 3,
            background: "#000000",
          },
        },
        left: 60,
        top: 45,
      },
    ])
    .png()
    .toBuffer();

  const traced = await traceRasterToSvg(source, { tracer: "potrace", sharp });
  assert.equal(traced.tracer, "potrace");
  assert.match(traced.svg, /<svg\b/);
  assert.ok(traced.metrics.boundaryIntegrity > 0.9);

  const verification = verifyVectorizationResult({
    source: { widthPx: 300, heightPx: 180 },
    result: {
      widthPx: traced.metrics.width,
      heightPx: traced.metrics.height,
      boundaryIntegrity: traced.metrics.boundaryIntegrity,
    },
    profile: {
      id: "local.engraving",
      manufacturer: "local",
      process: "engraving",
      format: "svg",
      allowVector: true,
      vectorization: {
        enabled: true,
        maxAspectDrift: 0.02,
        minBoundaryIntegrity: 0.9,
      },
    },
  });
  assert.equal(verification.verified, true);
});

test("capability probe reports machine transforms without inventing unavailable tools", async () => {
  const capabilities = await detectNodeTransformCapabilities();
  assert.equal(typeof capabilities.raster_normalizer, "boolean");
  assert.equal(typeof capabilities.vector_tracer, "boolean");
  assert.equal(typeof capabilities.tools.svgo, "boolean");
});
