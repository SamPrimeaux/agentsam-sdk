/** Shared AgentSam OCCT provider contract. Native C++ source lives in ./native. */
export const OCCT_ENGINE_ID = 'occt';
export const OCCT_PROVIDER_CONTRACT = 'agentsam.occt.provider.v1';

/** Canonical SDK operations currently mapped to the native provider. */
export const OCCT_NATIVE_OPERATIONS = Object.freeze([
  'design_model_build',
  'design_model_inspect',
]);

/** Provider capabilities; intentionally narrower than raw CLI capabilities. */
export const OCCT_NATIVE_CAPABILITIES = Object.freeze([
  'design.solid.create',
  'design.solid.inspect',
  'design.solid.export.step',
]);

export function toMillimeters(value, units) {
  if (units !== 'mm' && units !== 'in') throw new Error('occt_explicit_units_required');
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('occt_invalid_dimension');
  const size = units === 'in' ? value * 25.4 : value;
  if (size <= 0 || size > 1000000) throw new Error('occt_invalid_dimension');
  return size;
}
