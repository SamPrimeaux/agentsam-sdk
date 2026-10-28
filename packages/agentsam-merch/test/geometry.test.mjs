import assert from "node:assert/strict";
import test from "node:test";
import { calculateEffectivePpi, effectiveArtworkDpi, providerPrintSizeIn, rasterResolutionPreflight } from "../src/index.js";

test("provider declared physical units are explicit and equivalent", () => {
  for (const location of [{unit:"in",file_width:14,file_height:16},
    {unit:"cm",file_width:35.56,file_height:40.64},
    {unit:"mm",file_width:355.6,file_height:406.4},
    {unit:"px",file_width:4200,file_height:4800,dpi:300}]) {
    assert.deepEqual(providerPrintSizeIn(location),{width:14,height:16});
  }
  assert.equal(providerPrintSizeIn({file_width:4200,file_height:4800}),null);
});
test("print percent and cropped source pixels use matching manufactured geometry",()=>{
  const g=effectiveArtworkDpi({sourceWidthPx:1254,sourceHeightPx:1254,
    printWidthIn:14,printHeightIn:16,placementWidthPercent:100});
  assert.equal(g.dpi,89);assert.equal(g.printedWidthIn,14);
  const p=rasterResolutionPreflight({sourceWidthPx:1254,sourceHeightPx:1254,
    printWidthIn:14,printHeightIn:16,placementWidthPercent:100,targetPpi:300});
  assert.equal(p.status,"needs_review");assert.equal(p.effectivePpi,g.exactDpi);
  assert.equal(p.requiredWidthPx,4200);
  assert.equal(effectiveArtworkDpi({sourceWidthPx:1000,sourceHeightPx:1000,
    printWidthIn:10,printHeightIn:10,placementWidthPercent:50,placementHeightPercent:100}).dpi,100);
});
test("SDK compatibility preflight uses same placement width and alpha crop",()=>{
 const profile={id:"p",manufacturer:"generic",process:"dtg",format:"png",allowRaster:true,ppi:300};
 const at=calculateEffectivePpi({format:"png",widthPx:1200,heightPx:1200,
   contentWidthPx:600,contentHeightPx:600},profile,{printWidthIn:14,printHeightIn:16,placementWidthPercent:60});
 assert.ok(Math.abs(at.effectivePpi-600/8.4)<0.001);
 const without=calculateEffectivePpi({format:"png",widthPx:1200,heightPx:1200},profile,{printWidthIn:14,printHeightIn:16});
 assert.equal(without.effectivePpi,Math.min(1200/14,1200/16));
});
