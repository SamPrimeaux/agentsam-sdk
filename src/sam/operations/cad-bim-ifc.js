import { defineSamOperation } from '../define.js';
import { ifcDiff, ifcEdit, ifcInspect, ifcValidate, IFC_EDIT_OPERATIONS } from '../../lib/cad/ifc.js';

/**
 * Real IFC machinery, one IfcOpenShell adapter. Reads are read_only; edit writes a
 * NEW .ifc (never the source) and refuses to write unless it can prove no new
 * validation errors, every GlobalId kept, and no change outside the edited objects.
 */
const PATH = { type: 'string', minLength: 1, maxLength: 4096 };
const GUID = { type: 'string', pattern: '^[0-9A-Za-z_$]{22}$' };
const NAME = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_ .:-]{0,127}$' };
const common = {
  python: { type: 'string', description: 'Optional Python interpreter that has ifcopenshell; discovered when omitted.' },
  timeoutSeconds: { type: 'integer', minimum: 1, maximum: 600 },
};

const editSchema = {
  oneOf: [
    { type: 'object', required: ['op', 'globalId', 'attribute', 'value'], additionalProperties: false,
      properties: { op: { const: 'attribute.set' }, globalId: GUID,
        attribute: { enum: ['Name', 'Description', 'ObjectType', 'LongName', 'Tag'] },
        value: { type: ['string', 'null'] } } },
    { type: 'object', required: ['op', 'globalId', 'pset', 'name', 'value'], additionalProperties: false,
      properties: { op: { const: 'property.set' }, globalId: GUID, pset: NAME, name: NAME,
        value: { type: ['string', 'number', 'boolean'] } } },
    { type: 'object', required: ['op', 'globalId', 'pset', 'name'], additionalProperties: false,
      properties: { op: { const: 'property.remove' }, globalId: GUID, pset: NAME, name: NAME } },
    { type: 'object', required: ['op', 'globalId', 'delta_m'], additionalProperties: false,
      properties: { op: { const: 'placement.move' }, globalId: GUID,
        delta_m: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        with_children: { type: 'boolean' } } },
    { type: 'object', required: ['op', 'globalId', 'depth_m'], additionalProperties: false,
      properties: { op: { const: 'solid.extrusion_depth' }, globalId: GUID, depth_m: { type: 'number', exclusiveMinimum: 0 } } },
    { type: 'object', required: ['op', 'globalId'], additionalProperties: false,
      properties: { op: { const: 'element.remove' }, globalId: GUID, cascade: { type: 'boolean' } } },
  ],
};

const base = (action, summary, description, extra) => ({
  version: 1, module: 'cad', action, summary, description, status: 'stable',
  execution: { lanes: ['local', 'sandbox'], model: 'never', network: 'none', ...extra.execution },
  risk: extra.risk, capabilities: [`cad.bim.ifc.${action.replace('bim.ifc.', '')}`],
  cli: { command: [['cad', 'ifc', action.replace('bim.ifc.', '')]] }, docs: { section: 'CAD' },
  skill: 'agentsam-arch-bim',
});
const cwdOf = (input, ctx) => input.cwd || ctx.cwd || process.cwd();

export const cadBimIfcInspectOp = defineSamOperation({
  ...base('bim.ifc.inspect', 'Read an IFC into a semantic model keyed by GlobalId.',
    'Spatial tree, types, elements, spaces, property sets and relationships via IfcOpenShell. Check `model.truncated`.',
    { risk: 'read_only', execution: { sideEffects: 'none' } }),
  id: 'cad.bim.ifc.inspect',
  input_schema: { type: 'object', required: ['input'], additionalProperties: false,
    properties: { input: PATH, maxElements: { type: 'integer', minimum: 1, maximum: 200000 }, cwd: PATH, ...common } },
  handler: async (input = {}, ctx = {}) => ifcInspect({ ...input, cwd: cwdOf(input, ctx) }),
});

export const cadBimIfcValidateOp = defineSamOperation({
  ...base('bim.ifc.validate', 'Validate an IFC against its schema.',
    'IfcOpenShell schema validation (no EXPRESS rules). Not building-code compliance and not an IDS check.',
    { risk: 'read_only', execution: { sideEffects: 'none' } }),
  id: 'cad.bim.ifc.validate',
  input_schema: { type: 'object', required: ['input'], additionalProperties: false,
    properties: { input: PATH, cwd: PATH, ...common } },
  handler: async (input = {}, ctx = {}) => ifcValidate({ ...input, cwd: cwdOf(input, ctx) }),
});

export const cadBimIfcDiffOp = defineSamOperation({
  ...base('bim.ifc.diff', 'Compare two IFC files by GlobalId.',
    'Added, removed and changed objects (attributes, property sets, placement, extrusion geometry, type, container). States what it does not compare.',
    { risk: 'read_only', execution: { sideEffects: 'none' } }),
  id: 'cad.bim.ifc.diff',
  input_schema: { type: 'object', required: ['input', 'other'], additionalProperties: false,
    properties: { input: PATH, other: PATH, cwd: PATH, ...common } },
  handler: async (input = {}, ctx = {}) => ifcDiff({ ...input, cwd: cwdOf(input, ctx) }),
});

export const cadBimIfcEditOp = defineSamOperation({
  ...base('bim.ifc.edit', 'Edit an IFC by GlobalId into a new, proven copy.',
    `Allowlisted edits (${IFC_EDIT_OPERATIONS.join(', ')}). Never overwrites the source. Writes nothing unless the copy adds no validation errors, keeps every GlobalId (except explicit removals) and changes nothing outside the edited objects. 'base' is the sha256 of the source you read; a mismatch is a revision conflict.`,
    { risk: 'write', execution: { sideEffects: 'local_write' } }),
  id: 'cad.bim.ifc.edit',
  input_schema: { type: 'object', required: ['input', 'output', 'edits'], additionalProperties: false,
    properties: { input: PATH, output: PATH, base: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      edits: { type: 'array', minItems: 1, maxItems: 500, items: editSchema }, cwd: PATH, ...common } },
  handler: async (input = {}, ctx = {}) => ifcEdit({ ...input, cwd: cwdOf(input, ctx) }),
});

export const cadBimIfcOps = [cadBimIfcInspectOp, cadBimIfcValidateOp, cadBimIfcDiffOp, cadBimIfcEditOp];
