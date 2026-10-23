export type ModelFormat = 'glb' | 'gltf' | 'stl';
export function inferModelFormat(source: unknown, explicitFormat?: string): ModelFormat;
export const SUPPORTED_MODEL_FORMATS: readonly ModelFormat[];
