import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preflight = await readFile(
  new URL("../src/manufacturing/PreflightIndicator.tsx", import.meta.url),
  "utf8",
);
const loading = await readFile(
  new URL("../src/manufacturing/loading.ts", import.meta.url),
  "utf8",
);

test("preflight indicator exposes portable quality states and one-click remediation", () => {
  assert.match(preflight, /ready_with_warning/);
  assert.match(preflight, /Auto-Crop Alpha/);
  assert.match(preflight, /Convert to Monochrome Vector/);
  assert.match(preflight, /Scale to Fit Safe Zone/);
  assert.match(preflight, /aria-label=.*Effective print resolution/s);
  assert.doesNotMatch(preflight, /Fuel\s*&\s*Free\s*Time|Completeful/);
});

test("manufacturing loading controller uses one persistent scene controller", () => {
  assert.match(loading, /createManufacturingLoadingController/);
  assert.match(loading, /asset_ingest/);
  assert.match(loading, /preflight/);
  assert.match(loading, /color_normalization/);
  assert.match(loading, /vectorization/);
  assert.match(loading, /manufacturing_compile/);
  assert.match(loading, /digitization_handoff/);
  assert.match(loading, /controller\.activity/);
  assert.doesNotMatch(loading, /mountHyperspaceScene|requestAnimationFrame/);
});

test("receipt visualization reuses the same semantic stream contract", () => {
  assert.match(loading, /createReceiptPipelineLoadingController/);
  assert.match(loading, /receipt_persistence/);
  assert.match(loading, /workspace_cleanup/);
});
