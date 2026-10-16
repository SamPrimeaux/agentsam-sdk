/**
 * Canonical portable SAM JSON input boundary. This is the existing
 * deterministic generated-operation validator, shared with the client so
 * handlers with inline contracts cannot skip precondition checks.
 * Unresolved string schema references are not treated as validated.
 */
function reject(code) { const e = new Error(code); e.code = code; throw e; }
function validate(value, schema, label = 'input') {
  if (!schema) return;
  if (schema.not) {
    try { validate(value, schema.not, label); } catch { /* matches negative constraint: allowed */ return; }
    reject(`${label}:forbidden_combination`);
  }
  if (schema.oneOf) {
    const valid = schema.oneOf.filter(v => { try { validate(value, v, label); return true; } catch { return false; } });
    if (valid.length !== 1) reject(`${label}:exactly_one_source_required`);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !types.some(t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) : t === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : t === 'integer' ? Number.isInteger(value) : t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t)) reject(`${label}:invalid_type`);
  if (schema.enum && !schema.enum.includes(value)) reject(`${label}:invalid_enum`);
  if (typeof value === 'string' && schema.minLength != null && value.length < schema.minLength) reject(`${label}:too_short`);
  if (typeof value === 'string' && schema.maxLength != null && value.length > schema.maxLength) reject(`${label}:too_long`);
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) reject(`${label}:below_minimum`);
  if (typeof value === 'number' && schema.maximum != null && value > schema.maximum) reject(`${label}:above_maximum`);
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) reject(`${label}:too_few_items`);
    if (schema.maxItems != null && value.length > schema.maxItems) reject(`${label}:too_many_items`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, `${label}[${i}]`));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (value[key] === undefined) reject(`${label}.${key}:required`);
    if (schema.type !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) {
        if (schema.additionalProperties === false) reject(`${label}.${key}:unknown_field`);
      } else validate(child, schema.properties[key], `${label}.${key}`);
    }
  }
}
export { validate as validateSamInput };
