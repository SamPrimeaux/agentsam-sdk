export interface RemoveConnectedBackgroundPixelsOptions {
  /** RGB tolerance for pixels connected to the image border. Defaults to 42. */
  tolerance?: number;
  /** Maximum number of pixels processed. Defaults to 10,000,000. */
  maxPixels?: number;
}

export interface RemoveConnectedBackgroundPixelsResult {
  /** A new RGBA pixel buffer; the input buffer is never mutated. */
  pixels: Uint8ClampedArray;
  removedPixels: number;
  /** This operation removes connected flat-color backgrounds; it is not AI segmentation. */
  method: "flat_connected";
}

export declare function removeConnectedBackgroundPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: RemoveConnectedBackgroundPixelsOptions,
): RemoveConnectedBackgroundPixelsResult;
