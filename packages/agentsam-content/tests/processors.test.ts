import { describe, expect, it } from "vitest";
import { probeBytes } from "../src/processors/index.js";

function pngBytes(width: number, height: number, colorType = 6): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // signature
  // IHDR length + type
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b[24] = 8; // bit depth
  b[25] = colorType;
  return b;
}

function glbBytes(json: object): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const b = new Uint8Array(20 + jsonBytes.length);
  const dv = new DataView(b.buffer);
  b.set([0x67, 0x6c, 0x54, 0x46]); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, b.length, true);
  dv.setUint32(12, jsonBytes.length, true);
  b.set([0x4a, 0x53, 0x4f, 0x4e], 16); // 'JSON'
  b.set(jsonBytes, 20);
  return b;
}

describe("processors", () => {
  it("probes PNG dimensions and alpha", () => {
    const result = probeBytes(pngBytes(1280, 720, 6));
    expect(result?.kind).toBe("image");
    expect(result?.mime).toBe("image/png");
    expect(result?.width).toBe(1280);
    expect(result?.height).toBe(720);
    expect(result?.hasAlpha).toBe(true);
  });

  it("detects opaque PNG (colorType 2)", () => {
    const result = probeBytes(pngBytes(100, 50, 2));
    expect(result?.hasAlpha).toBe(false);
  });

  it("probes GLB structure counts", () => {
    const result = probeBytes(
      glbBytes({
        asset: { version: "2.0" },
        meshes: [{}, {}],
        materials: [{}],
        textures: [{}, {}, {}],
        animations: [],
        accessors: [
          { type: "VEC3", min: [-1, -2, -3], max: [1, 2, 3] },
        ],
      }),
    );
    expect(result?.kind).toBe("model");
    expect(result?.mime).toBe("model/gltf-binary");
    expect(result?.ext?.meshes).toBe(2);
    expect(result?.ext?.materials).toBe(1);
    expect(result?.ext?.textures).toBe(3);
    expect(result?.ext?.boundingBox).toEqual({ min: [-1, -2, -3], max: [1, 2, 3] });
  });

  it("detects PDF", () => {
    const result = probeBytes(new TextEncoder().encode("%PDF-1.7\n/Type /Page \n/Type /Page \n"));
    expect(result?.kind).toBe("document");
    expect(result?.mime).toBe("application/pdf");
    expect(result?.ext?.pages).toBe(2);
  });

  it("returns null for unknown bytes", () => {
    expect(probeBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toBeNull();
  });
});
