---
name: agentsam-arch-bim
description: >
  Work with real BIM and IFC: read a model's semantics (spatial tree, typed elements, property
  sets, GlobalIds), know exactly what the SDK can and cannot do with an IFC today, change a model
  without losing object identity, and prove the result by reopening it. Use for .ifc files, "BIM",
  IfcOpenShell, GlobalId, property sets, IDS checks, IFC import or export, "is this actually BIM",
  and any request to edit a building model. Triggers on "ifc", "bim", "ifcopenshell", "globalid",
  "pset", "ids", "semantic model", "import ifc", "export ifc", "round trip".
metadata:
  short-description: "Real BIM/IFC: read semantics, know what is supported, edit by GlobalId, prove by reopening"
  aliases:
    - arch-bim
    - bim
    - ifc
user-invocable: true
---

# Semantic BIM and IFC

Skill v0.3.0 (2026-11-23).

**CAD stores shapes. BIM stores things that have shapes**: each object knows its type, its
relationships and its data. IFC is the open file format that carries all of it. A file with
geometry but no types, relationships or properties is CAD in an `.ifc` wrapper. Say so; do not
call it BIM.

## What the SDK does today (re-check before relying)

| Need | How | State |
|---|---|---|
| Read an IFC into a semantic model | `cad.bim.ifc.inspect`, `agentsam cad ifc inspect` | **Available** (read-only) |
| Validate against the IFC schema | `cad.bim.ifc.validate`, `agentsam cad ifc validate` | **Available** (read-only) |
| Compare two IFC files by GlobalId | `cad.bim.ifc.diff`, `agentsam cad ifc diff` | **Available** (read-only) |
| Change a model, keeping identity | `cad.bim.ifc.edit`, `agentsam cad ifc edit` | **Available** (write; writes a new copy) |
| Project an inspected model into a read-only CAD project | `projectFromIfcInspection` (bim-bridge) | **Available** |
| Build a new IFC from a project (`cad.bim.ifc.export`) | declared intention | **Not an advertised operation.** A single rectangular shell can be exported through the CAD service's `cad.building.export` route; there is no general project-to-IFC export yet |
| IDS requirement checks | none | **No SDK operation.** Run your own tooling and label the result |

Confirm with `agentsam sam list` and `agentsam sam describe cad.bim.ifc.edit`. If an operation you
need is not listed, say "unsupported" and name what would unlock it. Never hand-write IFC text,
and never rename another format to `.ifc`. `agentsam-cad` lists IFC4 among OCCT export formats;
whatever that writes, reopen it with `inspect` and report which semantics actually survived
before calling it BIM.

## Check the runtime first

Locally, `agentsam cad ifc status` finds a Python that really imports IfcOpenShell (PATH, a venv,
or FreeCAD's bundled Python), or says what it searched. The CAD service capability probe reports
an `ifc` entry:

- `installed: true` means IfcOpenShell imports and `inspect` will run.
- `ready: true` additionally means the DXF and PDF libraries are present, which drawing and
  export work needs. `installed` without `ready` is fine for read-only inspection.
- If it is not installed, the error names the interpreters searched and the install command.
  Relay that; do not substitute a different parser.

Inputs to `inspect` must be a file reference `{kind:"file", mount, path}`, never a URL or inline
text. `max_elements` caps the output: **always check `truncated`** and refuse to treat a truncated
model as complete (the bridge itself throws on one).

## Reading the result (`agentsam.bim.model.v1`)

The contract lives in `@inneranimalmedia/agentsam-contracts/bim-model`. Top level:
`source` (IFC schema, sha256, byte length), `project` (GlobalId, name, length unit and its scale
to metres), `spatial` tree (site, building, storey), `types`, `elements`, `spaces`, and a count of
every IFC class present. Read in this order:

1. `source.ifcSchema` and `project.lengthUnit`. Everything else depends on them.
2. Class counts. This is the model's real inventory; compare it to what the user thinks they have.
3. The spatial tree. Elements with no container, or no type, are a modeling defect worth reporting.
4. `spaces[].hasGeometry`. False means a label, not a measurable room.
5. Declared property sets and quantities are what the author wrote, not what you measured.

## Rules that prevent silent corruption

1. **GlobalId is identity.** 22 characters; the alphabet includes `$` and `_`. Never regenerate
   one, never key on names, and never key on `#123` step numbers (they renumber on every write).
   Where a charset is restricted, encode losslessly; the bridge turns a GlobalId into `ifc:<hex>`.
2. **Units.** Read the project length unit and convert explicitly. IFC is usually metric; the
   current CAD project runtime is inch-based. State units on every number you report.
3. **Pin the schema.** IFC2X3, IFC4 and IFC4X3 differ in classes and property sets. Record the
   schema and never mix class names across versions.
4. **Relationships are data, not drawing.** A door is "in" a wall only if an opening voids the
   wall (`IfcRelVoidsElement`) and the door fills that opening (`IfcRelFillsElement`). Containment,
   aggregation, typing, materials and properties are each their own relationship. Check them
   before claiming connectivity.
5. **Standard names.** `Pset_*Common` property sets and, in IFC4, `Qto_*BaseQuantities` are
   standard; keep custom data under your own prefix.
6. **Geometry is not semantics.** Matching shapes prove nothing about types or relationships.

## Changing a model: the loop

```
open -> find by GlobalId -> edit -> validate -> save a copy (IDs kept) -> diff -> prove
```

`cad.bim.ifc.edit` runs that loop for you, in one call, on a **copy**:

```json
{ "input": "house.ifc", "output": "house-revB.ifc", "base": "<sha256 of house.ifc you read>",
  "edits": [
    { "op": "attribute.set", "globalId": "<22-char id>", "attribute": "Name", "value": "North Wall" },
    { "op": "property.set", "globalId": "<id>", "pset": "Pset_WallCommon", "name": "FireRating", "value": "1HR" },
    { "op": "placement.move", "globalId": "<id>", "delta_m": [0, 1.25, 0] },
    { "op": "solid.extrusion_depth", "globalId": "<id>", "depth_m": 3.2 },
    { "op": "element.remove", "globalId": "<id>", "cascade": true }
  ] }
```

Operations: `attribute.set` (Name, Description, ObjectType, LongName, Tag), `property.set` /
`property.remove` (occurrence property sets; `Qto_*` quantity sets are derived and refused),
`placement.move` (metres; carries objects placed relative to it unless `with_children:false`),
`solid.extrusion_depth` (only a single extrusion along local Z; anything else is refused, never
guessed), `element.remove` (refuses hosted doors and windows unless `cascade:true`; project,
site, building and storey are protected).

What it guarantees, because it checks before writing:

- the source file is never modified, and an existing output is never overwritten;
- `base` is a revision precondition: a mismatch is a conflict, so re-read and re-apply;
- the copy adds **no new validation errors**;
- every GlobalId survives except explicit removals (and the openings they cascade);
- **nothing changes outside the edited objects**; a collateral change fails the whole edit;
- one bad edit anywhere writes nothing.

Find the GlobalIds with `inspect` first; never guess one. Anything the allowlist does not cover
(new walls, new storeys, profile reshaping, re-hosting, new types) is unsupported: say so and name
the missing edit, rather than regenerating the model, which changes every ID and breaks links,
schedules and comments.

## Proving a result

`edit` returns its own diff, but prove it independently: run `cad.bim.ifc.diff` on source and
output, and `cad.bim.ifc.validate` on the output. A change is proven when you can show all of:

- **Diff by GlobalId:** added, removed, changed (with old and new values), and an explicit
  "unchanged: N objects".
- **Hashes:** `source_sha256` of the input and the model hash you analysed. The output file's own
  hash after any write.
- **Reopened output:** inspect the written file; do not trust the writer's exit code.
- **Counts by class** before and after, with every difference explained.

Round trip means: out, back in, same GlobalIds, same relationships, same property values. Do not
say "round-trips" unless you reopened it and compared. Receipt ids are not durable evidence;
cite command output, paths and hashes (see `agentsam-sam-operations`).

## IDS (Information Delivery Specification)

buildingSMART IDS is an XML requirements format that checks whether model *data* meets a
specification: entity, attribute, property, classification, material and part-of facets, each with
cardinality. It checks data presence and shape, not geometry and not building-code compliance.
Record the IDS version (1.0 at time of writing) and the checker used. A passing IDS is not
certification.

## Evidence statuses

Label every claim: `verified_reference`, `calculated_from_inputs`, `measured_in_artifact`,
`declared_in_source` (written in the IFC, not measured by you), `proposed`, `unresolved`,
`requires_professional_review`. Prefer deterministic measurement and source documents over model
recollection, confirm editions, units and applicability, and use only tools that are advertised
and actually verified.

## Report format

```
IFC: <file> sha256 <...>  schema <IFC4|...>  unit <...>  truncated <yes|no>
Runtime: ifc installed <y|n>  ready <y|n>  ifcopenshell <version>
Inventory: <class: count, ...>
Findings: <defects with GlobalIds>
Change: <none | diff by GlobalId>
Proof: <what was reopened and compared>
Unsupported: <what the SDK cannot do here and what would unlock it>
```

## Sources

- https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/index.html
- https://github.com/buildingSMART/IDS/releases/tag/v1.0.0
- https://docs.ifcopenshell.org/ifcopenshell-python.html
