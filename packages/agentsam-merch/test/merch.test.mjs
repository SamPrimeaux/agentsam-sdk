import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COLLECTION_CANDIDATE_STATE,
  COMPATIBILITY_STATUS,
  approvalsComplete,
  calculateEffectivePpi,
  createCollectionCandidate,
  createManufacturingProfileRegistry,
  createProductConceptRegistry,
  evaluateManufacturingCompatibility,
  planAutomaticTransforms,
  planMediaDerivatives,
  resolveProductConceptTarget,
  transitionCollectionCandidate,
  validateManufacturingProfile,
  verifyVectorizationResult,
} from "../src/index.js";

async function profile(name) {
  return JSON.parse(await readFile(new URL(`../profiles/${name}`, import.meta.url), "utf8"));
}

test("profile data validates", async () => {
  for (const name of [
    "completeful/dtg-back-large.json",
    "completeful/laser-engraving.json",
    "generic/embroidery-digitization.json",
  ]) {
    const result = validateManufacturingProfile(await profile(name));
    assert.equal(result.ok, true, `${name}: ${result.errors.join(", ")}`);
  }
});

test("large transparent PNG is ready for the verified Completeful DTG profile", async () => {
  const result = evaluateManufacturingCompatibility(
    {
      format: "png",
      mediaKind: "raster",
      widthPx: 4500,
      heightPx: 5100,
      bytes: 12000000,
      colorSpace: "srgb",
      hasAlpha: true
    },
    await profile("completeful/dtg-back-large.json"),
    { printWidthIn: 14, printHeightIn: 16 },
  );
  assert.equal(result.status, COMPATIBILITY_STATUS.READY);
  assert.equal(result.requirementsVerified, true);
  assert.equal(result.productionReady, true);
  assert.ok(result.effectivePpi >= 300);
});

test("low-resolution raster is not falsely called production ready", async () => {
  const result = evaluateManufacturingCompatibility(
    { format: "png", mediaKind: "raster", widthPx: 1500, heightPx: 1500, colorSpace: "srgb" },
    await profile("completeful/dtg-back-large.json"),
    { printWidthIn: 14, printHeightIn: 16 },
  );
  assert.equal(result.status, COMPATIBILITY_STATUS.NEEDS_VARIANT);
  assert.ok(result.issues.some((issue) => issue.code === "insufficient_resolution"));
});

test("engraving rejects gradient/open-path artwork", async () => {
  const result = evaluateManufacturingCompatibility(
    {
      format: "svg",
      mediaKind: "vector",
      colorMode: "full-color",
      hasGradients: true,
      hasOpenPaths: true,
      hasLiveText: true
    },
    await profile("completeful/laser-engraving.json"),
  );
  assert.equal(result.status, COMPATIBILITY_STATUS.NEEDS_VARIANT);
  assert.ok(result.actions.includes("simplify_gradients"));
  assert.ok(result.actions.includes("close_paths"));
});

test("embroidery stops at prepared for digitization", async () => {
  const result = evaluateManufacturingCompatibility(
    {
      format: "svg",
      mediaKind: "vector",
      colorMode: "spot",
      hasGradients: false,
      hasOpenPaths: false,
      hasLiveText: false
    },
    await profile("generic/embroidery-digitization.json"),
  );
  assert.equal(result.status, COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION);
  assert.equal(result.productionReady, false);
});

test("manufacturing and storefront derivatives remain separate", async () => {
  const plan = planMediaDerivatives({
    asset: { format: "png", mediaKind: "raster", widthPx: 4500, heightPx: 5100, colorSpace: "srgb" },
    profile: await profile("completeful/dtg-back-large.json"),
    target: { printWidthIn: 14, printHeightIn: 16 },
  });
  assert.equal(plan.source.immutableAuthority, true);
  assert.equal(plan.manufacturing.format, "png");
  assert.equal(plan.storefront.format, "webp");
  assert.equal(plan.manufacturing.mustNotUseStorefrontDerivative, true);
});

test("profile registry selects using data selectors", async () => {
  const registry = createManufacturingProfileRegistry([
    await profile("completeful/dtg-back-large.json"),
    await profile("completeful/laser-engraving.json"),
  ]);
  assert.equal(
    registry.select({
      manufacturer: "completeful",
      process: "dtg",
      locationName: "Back",
      printWidthIn: 14,
    })?.id,
    "completeful.dtg.back-large",
  );
});

test("collection lab uses explicit approvals and valid transitions", () => {
  const concept = createCollectionCandidate({
    id: "burn-it-gt-back-tee",
    designId: "burn-it-gt",
    collectionPath: ["Fuel & Free Time", "Performance", "Burn It GT"],
    approvals: { artwork: true, wording: true, palette: true, visualIdentity: true },
  });
  assert.equal(approvalsComplete(concept), true);
  const approved = transitionCollectionCandidate(
    concept,
    COLLECTION_CANDIDATE_STATE.APPROVED_ART,
  );
  assert.equal(approved.state, COLLECTION_CANDIDATE_STATE.APPROVED_ART);
  assert.throws(() =>
    transitionCollectionCandidate(approved, COLLECTION_CANDIDATE_STATE.PUBLISHED),
  );
});


test("effective PPI follows actual physical placement geometry", () => {
  const profile = {
    id: "test.dtg",
    manufacturer: "test",
    process: "dtg",
    format: "png",
    allowRaster: true,
    resolution: { readyPpi: 300, minimumPpi: 200 },
    source: { verified: true },
  };

  const ready = evaluateManufacturingCompatibility(
    { format: "png", widthPx: 3000, heightPx: 3600, colorSpace: "srgb" },
    profile,
    { placementWidthIn: 10, placementHeightIn: 12 },
  );
  assert.equal(ready.effectivePpi, 300);
  assert.equal(ready.status, COMPATIBILITY_STATUS.READY);

  const warning = evaluateManufacturingCompatibility(
    { format: "png", widthPx: 2400, heightPx: 2880, colorSpace: "srgb" },
    profile,
    { placementWidthIn: 10, placementHeightIn: 12 },
  );
  assert.equal(warning.effectivePpi, 240);
  assert.equal(warning.status, COMPATIBILITY_STATUS.READY_WITH_WARNING);
  assert.equal(warning.productionReady, true);

  const fail = evaluateManufacturingCompatibility(
    { format: "png", widthPx: 1500, heightPx: 1800, colorSpace: "srgb" },
    profile,
    { placementWidthIn: 10, placementHeightIn: 12 },
  );
  assert.equal(fail.effectivePpi, 150);
  assert.equal(fail.status, COMPATIBILITY_STATUS.NEEDS_VARIANT);
});

test("content bounds, not transparent canvas bounds, drive effective PPI", () => {
  const profile = {
    id: "test.dtg.trim",
    manufacturer: "test",
    process: "dtg",
    format: "png",
    allowRaster: true,
    resolution: { readyPpi: 300, minimumPpi: 200 },
    autoNormalize: { trimAlpha: true },
  };
  const ppi = calculateEffectivePpi(
    {
      format: "png",
      widthPx: 5000,
      heightPx: 5000,
      contentWidthPx: 2400,
      contentHeightPx: 3000,
      transparentBorderDetected: true,
      isAlphaTrimmed: false,
    },
    profile,
    { placementWidthIn: 10, placementHeightIn: 10 },
  );
  assert.equal(ppi.basis, "content_bounds");
  assert.equal(ppi.effectivePpi, 240);

  const compatibility = evaluateManufacturingCompatibility(
    {
      format: "png",
      widthPx: 5000,
      heightPx: 5000,
      contentWidthPx: 2400,
      contentHeightPx: 3000,
      transparentBorderDetected: true,
      isAlphaTrimmed: false,
    },
    profile,
    { placementWidthIn: 10, placementHeightIn: 10 },
  );
  assert.ok(compatibility.actions.includes("trim_alpha"));
  assert.equal(compatibility.status, COMPATIBILITY_STATUS.READY_WITH_TRANSFORM);
});

test("engraving raster can be auto-vectorized but is never silently called ready", async () => {
  const engraving = await profile("completeful/laser-engraving.json");
  const compatibility = evaluateManufacturingCompatibility(
    {
      format: "png",
      mediaKind: "raster",
      widthPx: 3000,
      heightPx: 3000,
      colorMode: "full-color",
    },
    engraving,
  );
  assert.equal(compatibility.status, COMPATIBILITY_STATUS.READY_WITH_TRANSFORM);
  assert.ok(compatibility.actions.includes("vectorize_monochrome"));

  const plan = planAutomaticTransforms({
    asset: {
      format: "png",
      mediaKind: "raster",
      widthPx: 3000,
      heightPx: 3000,
      colorMode: "full-color",
    },
    profile: engraving,
    capabilities: {
      vector_tracer: true,
      raster_normalizer: true,
    },
  });
  assert.ok(plan.operations.some((operation) => operation.id === "vectorize_monochrome"));
  assert.ok(plan.operations.every((operation) => operation.id !== "vectorize_monochrome" || operation.executable));
});

test("vectorization result must preserve aspect ratio and boundary integrity", async () => {
  const engraving = await profile("completeful/laser-engraving.json");
  const good = verifyVectorizationResult({
    source: { widthPx: 1000, heightPx: 500 },
    result: { widthPx: 1000, heightPx: 500, boundaryIntegrity: 0.995 },
    profile: engraving,
  });
  assert.equal(good.verified, true);

  const bad = verifyVectorizationResult({
    source: { widthPx: 1000, heightPx: 500 },
    result: { widthPx: 900, heightPx: 500, boundaryIntegrity: 0.91 },
    profile: engraving,
  });
  assert.equal(bad.verified, false);
  assert.ok(["aspect_ratio_drift", "boundary_integrity_below_threshold"].includes(bad.reason));
});

test("product concepts select providers without baking provider logic into the engine", () => {
  const profiles = createManufacturingProfileRegistry([
    {
      id: "provider-a.dtg.standard",
      manufacturer: "provider-a",
      process: "dtg",
      format: "png",
      allowRaster: true,
    },
    {
      id: "provider-b.dtg.standard",
      manufacturer: "provider-b",
      process: "dtg",
      format: "png",
      allowRaster: true,
    },
  ]);
  const concepts = createProductConceptRegistry([
    {
      id: "heavyweight-graphic-tee",
      label: "Heavyweight Graphic Tee",
      targets: [
        { provider: "provider-a", profileId: "provider-a.dtg.standard", priority: 0 },
        { provider: "provider-b", profileId: "provider-b.dtg.standard", priority: 10 },
      ],
    },
  ]);
  const resolved = resolveProductConceptTarget(
    concepts.get("heavyweight-graphic-tee"),
    {
      profileRegistry: profiles,
      availableProviders: ["provider-b"],
    },
  );
  assert.equal(resolved.selected.provider, "provider-b");
  assert.equal(resolved.selected.profileId, "provider-b.dtg.standard");
});

test("missing provider warning threshold fails closed instead of inventing one", () => {
  const profile = {
    id: "test.strict",
    manufacturer: "test",
    process: "dtg",
    format: "png",
    allowRaster: true,
    ppi: 300,
    source: { verified: true },
  };
  const result = evaluateManufacturingCompatibility(
    { format: "png", widthPx: 2500, heightPx: 2500 },
    profile,
    { placementWidthIn: 10, placementHeightIn: 10 },
  );
  assert.equal(result.status, COMPATIBILITY_STATUS.NEEDS_VARIANT);
  assert.equal(result.resolution.minimumPpi, 300);
});
