import test from "node:test";
import assert from "node:assert/strict";
import {colorAdjustmentPreviewFilter} from "../dist/color-adjustments.js";

test("neutral adjustments do not alter the footage preview", () => {
  assert.equal(colorAdjustmentPreviewFilter(undefined), "");
  assert.equal(colorAdjustmentPreviewFilter({exposure:0,contrast:0,saturation:100}), "");
});

test("browser preview applies exposure contrast and saturation without dropping other preview filters", () => {
  const css = colorAdjustmentPreviewFilter({exposure:1,contrast:25,saturation:75});
  assert.match(css, /^brightness\(2\.0000\) contrast\(1\.2500\) saturate\(0\.7500\)$/);
});

test("secondary adjustments produce a bounded visible browser approximation",()=>{
  const css=colorAdjustmentPreviewFilter({temperature:65,tint:20,highlights:35,shadows:-15,hue:24,lift:12,gamma:17,gain:10,luminance:20});
  assert.match(css,/sepia\(/);
  assert.match(css,/hue-rotate\(/);
  assert.match(css,/brightness\(/);
  assert.doesNotMatch(css,/NaN|Infinity/);
});
