import test from "node:test";
import assert from "node:assert/strict";
import { printifyProfileContext, printifyTarget } from "../src/adapters-printify.js";

test("Printify adapter preserves blueprint/provider/variant identity and print position", () => {
  const selection = printifyProfileContext(
    { id: 12, title: "Everyday Shirt" },
    { id: 44 },
    { id: 77 },
    { position: "front", decoration_method: "dtg", width: 4000, height: 5000 },
  );
  assert.equal(selection.manufacturer, "printify");
  assert.equal(selection.process, "dtg");
  assert.equal(selection.productType, "everyday shirt");
  assert.equal(selection.locationName, "front");
  assert.equal(selection.providerProductId, 12);
  assert.equal(selection.providerPrintProviderId, 44);
  assert.equal(selection.providerVariantId, 77);
  assert.equal(selection.providerLocationId, "front");
  assert.equal(selection.printWidthIn, null);
  assert.equal(selection.printHeightIn, null);
  assert.equal(selection.providerDpi, null);
});

test("explicit physical size is converted without inferring unverified provider requirements", () => {
  const result = printifyProfileContext(
    { id: 9 }, { id: 13 }, { id: 21 }, { position: "back" },
    { physicalSize: { width: 210, height: 297, unit: "mm" }, providerDpi: 300 },
  );
  assert.ok(Math.abs(result.printWidthIn - 210 / 25.4) < 1e-10);
  assert.ok(Math.abs(result.printHeightIn - 297 / 25.4) < 1e-10);
  assert.equal(result.providerDpi, 300);
  assert.equal(result.process, null);
});

test("unverified units and invalid dimensions are never treated as print-ready", () => {
  assert.deepEqual(
    printifyTarget({ width: 3200, height: 4100, unit: "px" }, 0),
    { printWidthIn: null, printHeightIn: null, providerDpi: null, providerUnit: "PX" },
  );
  assert.equal(printifyTarget({ width: 6, height: 8, unit: "in" }).printHeightIn, 8);
});
