/**
 * Shared TypeScript authoring semantics for the existing Theme Studio.
 * Definitions are account-scoped cms_definitions data, not PAGE_REGISTRY pages.
 * The engine never creates renderers or writes to D1/R2.
 */
export type Kind = 'section' | 'block';
export type FieldType = 'text' | 'textarea' | 'rich_text' | 'boolean'
  | 'number' | 'range' | 'select' | 'color' | 'link'
  | 'media' | 'video' | 'product' | 'collection' | 'variant' | 'url' | 'json';
export type Condition = { fieldId: string; operator: 'equals' | 'not_equals' | 'in'; value: unknown };
export type Option = { value: string; label: string; group?: string };
export type Setting = {
  key: string; label: string; type: FieldType; group?: string; help?: string;
  default?: unknown; options?: Option[]; visibleWhen?: Condition[];
  required?: boolean; min?: number; max?: number; step?: number; unit?: string;
};
export type Definition = {
  id: string; key: string; kind: Kind; version: string; label: string;
  status: string; origin: string; settings: readonly Setting[];
  allowedChildren: readonly string[]; maxBlocks: number | null;
  rendererKey: string | null; renderable: boolean; displayLabel: readonly string[];
};
export type InspectorField = Setting & { value: unknown; valueSource: 'stored' | 'default' | 'unset' };
export type Insertion = { parentKey: string; childKey: string; existingChildKeys: readonly string[] };
export type Eligibility = { allowed: boolean; reason?: string };

const KEY = /^[a-z][a-z0-9-]{0,63}$/;
// D1 schemas already contain nested settings such as action.label and
// ctaPrimary.href. Preserve those paths without permitting prototype keys.
const FIELD = /^[a-z][a-zA-Z0-9_-]{0,63}(?:\.[a-z][a-zA-Z0-9_-]{0,63})*$/;
const TYPES = new Set<FieldType>([
  'text','textarea','rich_text','boolean','number','range','select',
  'color','link','media','video','product','collection','variant','url','json'
]);
const OPS = new Set(['equals','not_equals','in']);
const own = (obj: object,key: string): boolean => Object.prototype.hasOwnProperty.call(obj,key);
const isObject = (v: unknown): v is Record<string,unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (reason: string): never => { throw new Error('cms_authoring_' + reason); };

function normalizeSetting(key: string, source: unknown): Setting {
  if (!FIELD.test(key) || !isObject(source) || typeof source.label !== 'string')
    return fail('invalid_setting:' + key);
  const aliases: Record<string,string> = { richtext:'rich_text', destination:'link', toggle:'boolean' };
  const type = (aliases[String(source.type)] || String(source.type)) as FieldType;
  if (!TYPES.has(type)) return fail('unsupported_type:' + key);
  const result: Setting = { key, label:source.label, type };
  for (const name of ['group','help','unit'] as const) {
    if (source[name] !== undefined) {
      if (typeof source[name] !== 'string') return fail('invalid_' + name + ':' + key);
      result[name] = source[name] as string;
    }
  }
  for (const name of ['min','max','step'] as const) {
    if (source[name] !== undefined) {
      if (typeof source[name] !== 'number' || !Number.isFinite(source[name]))
        return fail('invalid_' + name + ':' + key);
      result[name] = source[name] as number;
    }
  }
  if (result.min !== undefined && result.max !== undefined && result.min > result.max)
    return fail('invalid_range:' + key);
  if (result.step !== undefined && result.step <= 0) return fail('invalid_step:' + key);
  if (source.required !== undefined) {
    if (typeof source.required !== 'boolean') return fail('invalid_required:' + key);
    result.required = source.required;
  }
  if (own(source,'default')) {
    if (source.default !== null && typeof source.default === 'object') {
      try { result.default = structuredClone(source.default); }
      catch { return fail('nonserializable_default:' + key); }
    } else {
      if (typeof source.default === 'function') return fail('nonserializable_default:' + key);
      result.default = source.default;
    }
    if (['number','range'].includes(type) && typeof result.default !== 'number')
      return fail('invalid_number_default:' + key);
    if (type === 'boolean' && typeof result.default !== 'boolean')
      return fail('invalid_boolean_default:' + key);
  }
  if (type === 'select') {
    if (!Array.isArray(source.options) || !source.options.length ||
      !source.options.every((v: unknown) => isObject(v) &&
        typeof v.value === 'string' && typeof v.label === 'string'))
      return fail('invalid_options:' + key);
    result.options = structuredClone(source.options) as Option[];
    if (own(result,'default') && !result.options.some(v => v.value === result.default))
      return fail('invalid_option_default:' + key);
  }
  if (source.visibleWhen !== undefined) {
    if (!Array.isArray(source.visibleWhen) || !source.visibleWhen.every((v: unknown) =>
      isObject(v) && typeof v.fieldId === 'string' && FIELD.test(v.fieldId) &&
      OPS.has(String(v.operator)) && own(v,'value') &&
      (v.operator !== 'in' || Array.isArray(v.value))))
      return fail('invalid_visibility:' + key);
    result.visibleWhen = structuredClone(source.visibleWhen) as Condition[];
  }
  return Object.freeze(result);
}

export function normalizeDefinition(raw: unknown): Definition {
  if (!isObject(raw) || typeof raw.key !== 'string' || !KEY.test(raw.key))
    return fail('invalid_definition_key');
  if (raw.kind !== 'section' && raw.kind !== 'block') return fail('invalid_kind:' + raw.key);
  if (typeof raw.id !== 'string' || typeof raw.label !== 'string' ||
      typeof raw.version !== 'string' || !raw.version.trim())
    return fail('invalid_identity:' + raw.key);
  const source = raw.fields ?? {};
  if (!isObject(source) && !Array.isArray(source)) return fail('invalid_fields:' + raw.key);
  const pairs: Array<[string,unknown]> = Array.isArray(source)
    ? source.map((v: unknown) => [isObject(v) ? String(v.key) : '',v])
    : Object.entries(source);
  const seen = new Set<string>();
  const settings = pairs.map(([key,spec]) => {
    if (seen.has(key)) return fail('duplicate_setting:' + key);
    seen.add(key);
    return normalizeSetting(key,spec);
  });
  const allowed = raw.allowedBlocks ?? raw.allowedChildren ?? [];
  if (!Array.isArray(allowed) || !allowed.every(v => typeof v === 'string' && KEY.test(v)))
    return fail('invalid_children:' + raw.key);
  const maxBlocks = raw.maxBlocks ?? null;
  if (maxBlocks !== null && (!Number.isInteger(maxBlocks) || (maxBlocks as number) < 0))
    return fail('invalid_max_blocks:' + raw.key);
  const metadata = isObject(raw.metadata) ? raw.metadata : {};
  const rendererKey = typeof metadata.rendererKey === 'string' && metadata.rendererKey.trim()
    ? metadata.rendererKey : isObject(raw.artifact) && typeof raw.artifact.id === 'string'
      ? raw.artifact.id : null;
  // A metadata rendererKey is a claim, not proof that implementation exists.
  // The D1 adapter attaches artifact only after the account-scoped ready join.
  const artifactReady = isObject(raw.artifact) &&
    typeof raw.artifact.id === 'string' &&
    typeof raw.artifact.contentHash === 'string' &&
    typeof raw.artifact.manifestObjectKey === 'string';
  const displayLabel = Array.isArray(metadata.displayLabel) &&
    metadata.displayLabel.every(v => typeof v === 'string')
      ? metadata.displayLabel as string[] : ['heading','title','text','label'];
  return Object.freeze({
    id:raw.id, key:raw.key, kind:raw.kind, version:raw.version, label:raw.label,
    status:typeof raw.status === 'string' ? raw.status : 'draft',
    origin:typeof raw.origin === 'string' ? raw.origin : 'unknown',
    settings:Object.freeze(settings), allowedChildren:Object.freeze([...allowed]) as string[],
    maxBlocks: maxBlocks as number | null, rendererKey,
    renderable: artifactReady, displayLabel:Object.freeze([...displayLabel])
  });
}

function isVisible(setting: Setting, values: Record<string,unknown>): boolean {
  return (setting.visibleWhen || []).every(rule => {
    const current = values[rule.fieldId];
    if (rule.operator === 'equals') return current === rule.value;
    if (rule.operator === 'not_equals') return current !== rule.value;
    return Array.isArray(rule.value) && rule.value.includes(current);
  });
}

/** Read-model for a tenant's validated definition records; no extra registry/state owner. */
export function createAuthoringEngine(raw: readonly unknown[], options: {verifiedRenderers?: readonly string[]} = {}) {
  if (!Array.isArray(raw)) return fail('definitions_not_array');
  // The host passes renderer keys obtained from its trusted implementation
  // registry. D1 metadata cannot grant itself renderer availability.
  const verified = new Set(options.verifiedRenderers || []);
  const definitions = new Map<string,Definition>();
  const diagnostics: Array<{key:string;error:string}> = [];
  for (const row of raw) {
    try {
      const normalized = normalizeDefinition(row);
      const definition: Definition = Object.freeze({
        ...normalized,
        renderable: normalized.renderable ||
          (normalized.origin !== 'generated' &&
            normalized.rendererKey !== null && verified.has(normalized.rendererKey))
      });
      const identity = definition.kind + ':' + definition.key;
      const previous = definitions.get(identity);
      if (!previous || definition.version.localeCompare(previous.version,undefined,{numeric:true}) > 0)
        definitions.set(identity,definition);
    } catch (error) {
      diagnostics.push({
        key:isObject(row) && typeof row.key === 'string' ? row.key : 'unknown',
        error:error instanceof Error ? error.message : 'invalid_definition'
      });
    }
  }
  const get = (kind: Kind,key: string): Definition | null =>
    definitions.get(kind + ':' + key) || null;

  function inspector(kind: Kind,key: string,values: Record<string,unknown> = {}): InspectorField[] {
    const definition = get(kind,key);
    if (!definition) return [];
    const effective = Object.fromEntries(definition.settings.map(s =>
      [s.key,own(values,s.key) ? values[s.key] : s.default]));
    return definition.settings.filter(s => isVisible(s,effective)).map(s => ({
      ...s, value:effective[s.key],
      valueSource:own(values,s.key) ? 'stored' : own(s,'default') ? 'default' : 'unset'
    }));
  }
  /**
   * The storefront renderer defines what fields actually exist. Apply D1's
   * declarative schema only when it covers all those fields with compatible
   * types; stale definitions must never hide or invent editable controls.
   */
  function rendererFields(
    kind: Kind,key: string,
    nativeFields: readonly {key:string; type?:string; [name:string]:unknown}[],
    values: Record<string,unknown> = {}
  ) {
    const definition = get(kind,key);
    if (!definition) return [...nativeFields];
    const declared = new Map(definition.settings.map(setting => [setting.key,setting]));
    if (!nativeFields.every(field => {
      const spec = declared.get(field.key);
      return spec && spec.type === (field.type || 'text');
    })) return [...nativeFields];
    const shown = new Set(inspector(kind,key,values).map(field => field.key));
    return nativeFields.filter(field => shown.has(field.key)).map(field => ({
      ...field, ...declared.get(field.key), key:field.key
    }));
  }
  function eligibility(request: Insertion): Eligibility {
    const parent = get('section',request.parentKey) || get('block',request.parentKey);
    const child = get('block',request.childKey);
    if (!parent) return {allowed:false,reason:'unknown_parent'};
    if (!child || child.status !== 'active') return {allowed:false,reason:'unknown_child'};
    if (!child.renderable) return {allowed:false,reason:'renderer_unavailable'};
    if (!parent.allowedChildren.includes(child.key)) return {allowed:false,reason:'incompatible_parent'};
    if (parent.maxBlocks !== null && request.existingChildKeys.length >= parent.maxBlocks)
      return {allowed:false,reason:'parent_full'};
    return {allowed:true};
  }
  function catalog(parentKey: string,existingChildKeys: readonly string[] = []): Definition[] {
    return [...definitions.values()].filter(def => def.kind === 'block' && eligibility({
      parentKey,childKey:def.key,existingChildKeys
    }).allowed).sort((a,b) => a.label.localeCompare(b.label));
  }
  function describe(kind: Kind,key: string,values: Record<string,unknown> = {}): string {
    const definition = get(kind,key);
    if (!definition) return key;
    for (const field of definition.displayLabel) {
      const value = values[field];
      if (typeof value === 'string' && value.trim())
        return definition.label + ' — ' + value.replace(/\s+/g,' ').trim().slice(0,72);
    }
    return definition.label;
  }
  return Object.freeze({ get,inspector,rendererFields,eligibility,catalog,describe,
    diagnostics:Object.freeze(diagnostics),count:definitions.size });
}
