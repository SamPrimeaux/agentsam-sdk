import fs from 'node:fs';
import path from 'node:path';
import { ifcDiff, ifcEdit, ifcInspect, ifcStatus, ifcValidate } from './ifc.js';

export function ifcUsage() {
  return `AgentSam CAD: real IFC/BIM operations (IfcOpenShell)

Usage:
  agentsam cad ifc status [--python <path>] [--json]
  agentsam cad ifc inspect <model.ifc> [--max-elements <n>] [--json]
  agentsam cad ifc validate <model.ifc> [--json]
  agentsam cad ifc diff <before.ifc> <after.ifc> [--json]
  agentsam cad ifc edit <model.ifc> --edits <edits.json> --out <new.ifc> [--base <sha256>] [--json]

edit never overwrites the source. It writes a new .ifc only when the copy adds no validation
errors, keeps every GlobalId (except explicit removals) and changes nothing outside the edited
objects. --edits is a JSON array; supported ops: attribute.set, property.set, property.remove,
placement.move, solid.extrusion_depth, element.remove.

IfcOpenShell is found automatically (PATH Python, a venv, or FreeCAD's bundled Python).
Use --python <path> to choose one. Install with: pip install ifcopenshell`;
}

function parse(argv) {
  const opts = { positional: [], json: false };
  const values = new Set(['--python', '--timeout', '--cwd', '--out', '--edits', '--base', '--max-elements']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (values.has(arg)) {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      opts[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    } else if (arg.startsWith('-')) throw new Error(`unknown cad ifc option: ${arg}`);
    else opts.positional.push(arg);
  }
  return opts;
}

const need = (value, message) => { if (!value) throw new Error(message); return value; };

function summarize(result) {
  if (result.capability === 'cad.bim.ifc.status') {
    return result.available
      ? `IfcOpenShell ${result.ifcopenshell} via ${result.python} (${result.source})`
      : `IfcOpenShell not found (${(result.searched || []).join(', ')})\n${result.guidance}`;
  }
  if (result.capability === 'cad.bim.ifc.inspect') {
    const m = result.model;
    return `${m.source.ifcSchema} ${m.project.name ?? ''} - ${m.elements.length} elements, ${m.spaces.length} spaces, truncated: ${m.truncated}\nsha256 ${result.input.sha256}`;
  }
  if (result.capability === 'cad.bim.ifc.validate') {
    return `${result.valid ? 'valid' : 'INVALID'} - ${JSON.stringify(result.counts)}`;
  }
  const c = result.diff?.counts ?? result.counts;
  const head = `added ${c.added}, removed ${c.removed}, changed ${c.changed}, unchanged ${c.unchanged}`;
  return result.capability === 'cad.bim.ifc.edit' ? `wrote ${result.output.path}\nsha256 ${result.output.sha256}\n${head}` : head;
}

export async function runIfcCli(argv) {
  const action = argv[0];
  if (!action || action === '--help' || action === '-h') { console.log(ifcUsage()); return undefined; }
  const opts = parse(argv.slice(1));
  if (opts.help) { console.log(ifcUsage()); return undefined; }
  const cwd = path.resolve(opts.cwd || process.cwd());
  const shared = { python: opts.python, cwd, timeoutSeconds: opts.timeout == null ? undefined : Number(opts.timeout) };
  let result;
  if (action === 'status') result = await ifcStatus(shared);
  else if (action === 'inspect') result = await ifcInspect({ ...shared, input: need(opts.positional[0], 'inspect requires <model.ifc>'), maxElements: opts.maxElements ? Number(opts.maxElements) : undefined });
  else if (action === 'validate') result = await ifcValidate({ ...shared, input: need(opts.positional[0], 'validate requires <model.ifc>') });
  else if (action === 'diff') result = await ifcDiff({ ...shared, input: need(opts.positional[0], 'diff requires <before.ifc> <after.ifc>'), other: need(opts.positional[1], 'diff requires <before.ifc> <after.ifc>') });
  else if (action === 'edit') {
    const file = path.resolve(cwd, need(opts.edits, 'edit requires --edits <edits.json>'));
    if (!fs.existsSync(file)) throw new Error(`edits file not found: ${file}`);
    let edits;
    try { edits = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new Error(`invalid edits JSON: ${error.message}`); }
    result = await ifcEdit({ ...shared, input: need(opts.positional[0], 'edit requires <model.ifc>'), output: need(opts.out, 'edit requires --out <new.ifc>'), edits, base: opts.base });
  } else throw new Error(`unknown cad ifc action: ${action}`);
  console.log(opts.json ? JSON.stringify(result, null, 2) : summarize(result));
  return result;
}
