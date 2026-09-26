export class BrandAssetError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = 'BrandAssetError';
    this.code = code;
    this.details = details;
  }
}

export function assert(condition, code, message, details) {
  if (!condition) throw new BrandAssetError(code, message, details);
}
