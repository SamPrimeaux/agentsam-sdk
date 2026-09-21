import { createHash } from 'node:crypto';

// Deliberately bounded dialect. Unsupported validation keywords fail locally;
// never silently weaken a schema or mutate the protocol artifact.
const annotations = new Set(['$schema', '$id', '$comment', 'title', 'default', 'examples']);
const keywords = new Set(['type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'anyOf', 'enum', 'const', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems']);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function compileToolSchema({ provider, canonicalSchema, strict = true, name = 'tool' }) {
  if (!['openai', 'grok', 'gemini'].includes(provider)) throw new Error(`tool_schema_provider_unsupported:${provider}`);
  const strictMode = provider !== 'gemini' && strict;
  const transformations = [];
  const fail = (path, reason) => { throw new TypeError(`tool_schema_invalid:${provider}:${name}:${path}:${reason}`); };
  function visit(schema, path, depth = 0) {
    if (depth > 10) fail(path, 'schema_depth_exceeded');
    if (!object(schema)) fail(path, 'expected_schema_object');
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
      if (annotations.has(key)) { transformations.push(`${path}:omit:${key}`); continue; }
      if (!keywords.has(key)) fail(path, `unsupported_keyword:${key}`);
      Object.defineProperty(out, key, { value: structuredClone(value), enumerable: true, writable: true, configurable: true });
    }
    if (out.const !== undefined) { out.enum = [out.const]; delete out.const; }
    if (out.enum !== undefined && (!Array.isArray(out.enum) || !out.enum.length || out.enum.some(v => v !== null && !['string', 'number', 'boolean'].includes(typeof v)))) fail(path, 'invalid_enum');
    if (!out.type && out.enum) {
      const inferred = [...new Set(out.enum.map(v => v === null ? 'null' : typeof v))];
      out.type = inferred.length === 1 ? inferred[0] : inferred;
    }
    if (!out.type && out.properties) out.type = 'object';
    const declared = Array.isArray(out.type) ? out.type : out.type ? [out.type] : [];
    if (declared.some(t => !types.has(t)) || new Set(declared).size !== declared.length) fail(path, 'invalid_type');
    if (!declared.length && !out.anyOf) fail(path, 'unbounded_schema');
    if (out.anyOf) {
      if (!Array.isArray(out.anyOf) || !out.anyOf.length) fail(path, 'invalid_anyOf');
      out.anyOf = out.anyOf.map((s, i) => visit(s, `${path}.anyOf[${i}]`, depth + 1));
    }
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) {
      if (out[key] !== undefined && (!Number.isFinite(out[key]) || (!['minimum', 'maximum'].includes(key) && (!Number.isInteger(out[key]) || out[key] < 0)))) fail(path, `invalid_${key}`);
    }
    for (const [min, max] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) {
      if (out[min] !== undefined && out[max] !== undefined && out[min] > out[max]) fail(path, `invalid_bounds:${min}`);
    }
    for (const key of ['description', 'pattern', 'format']) if (out[key] !== undefined && typeof out[key] !== 'string') fail(path, `invalid_${key}`);
    if (out.pattern) { try { new RegExp(out.pattern); } catch { fail(path, 'invalid_pattern'); } }
    if (out.format && !['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uuid'].includes(out.format)) fail(path, 'unsupported_format');
    if (declared.includes('object')) {
      const props = out.properties ?? {};
      if (!object(props)) fail(path, 'invalid_properties');
      const required = out.required ?? [];
      if (!Array.isArray(required) || new Set(required).size !== required.length || required.some(k => typeof k !== 'string' || !Object.hasOwn(props, k))) fail(path, 'invalid_required');
      if (out.additionalProperties !== undefined && typeof out.additionalProperties !== 'boolean') fail(path, 'dynamic_properties_unsupported');
      if (strictMode && out.additionalProperties === true) fail(path, 'open_object_not_strict');
      out.properties = Object.fromEntries(Object.entries(props).map(([key, schema]) => {
        let child = visit(schema, `${path}.properties.${key}`, depth + 1);
        if (strictMode && !required.includes(key)) {
          child = { anyOf: [child, { type: 'null' }] };
          transformations.push(`${path}.${key}:optional_to_nullable`);
        }
        return [key, child];
      }));
      out.required = strictMode ? Object.keys(props) : required;
      if (strictMode) out.additionalProperties = false;
    } else if (out.properties || out.required || out.additionalProperties !== undefined) fail(path, 'object_keywords_without_object');
    if (declared.includes('array')) {
      if (!out.items) fail(path, 'array_items_required');
      out.items = visit(out.items, `${path}.items`, depth + 1);
    } else if (out.items) fail(path, 'items_without_array');
    return out;
  }
  const providerSchema = visit(canonicalSchema ?? { type: 'object', properties: {}, required: [], additionalProperties: false }, '$');
  if (providerSchema.type !== 'object' || providerSchema.anyOf) fail('$', 'root_must_be_object');
  return { providerSchema, transformations, warnings: [], unsupportedKeywords: [], hash: createHash('sha256').update(JSON.stringify(providerSchema)).digest('hex') };
}

// Null added by a strict projection means omission in the canonical contract.
export function restoreOptionalArguments(value, schema) {
  if (Array.isArray(value)) return value.map(v => restoreOptionalArguments(v, schema?.items));
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key, v]) => {
    const child = schema?.properties?.[key];
    const nullable = child?.type === 'null' || child?.type?.includes?.('null') || child?.anyOf?.some(s => s.type === 'null');
    return !(v === null && child && !schema?.required?.includes(key) && !nullable);
  }).map(([key, v]) => [key, restoreOptionalArguments(v, schema?.properties?.[key])]));
}
