#!/usr/bin/env python3
"""Fixed IfcOpenShell-side adapter for AgentSam BIM semantics.

Executed in a Python environment that has ifcopenshell (the CAD container venv,
or any local interpreter with it installed). Accepts a bounded JSON request with
allowlisted operations; never evaluates user-provided code.

Operations
  inspect   Read an IFC and write an `agentsam.bim.model.v1` document: spatial
            tree, types, materials, property sets, quantities, the
            wall -> opening -> door chain and spaces, all keyed by GlobalId.
  validate  Run IfcOpenShell schema validation; report issues by level.
  diff      Compare two IFC files by GlobalId: added, removed, and changed
            (attributes, property sets, placement, extrusion geometry, type,
            container). Anything the diff does not compare is stated.
  edit      Apply an allowlisted batch of edits by GlobalId to a *copy* of the
            source, then prove the copy: no new validation errors, every
            GlobalId preserved, and no change outside the edited objects.
            Nothing is written unless every check passes.

Typed fields are SI (meters, square meters). Property-set values are returned as
authored in the file: the IFC does not say which numeric properties are lengths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    import ifcopenshell
    import ifcopenshell.util.element as element_util
    import ifcopenshell.util.unit as unit_util
except ImportError as err:
    print(f"AGENTSAM_RESULT={json.dumps({'ok': False, 'error': f'ifcopenshell unavailable: {err}'})}", flush=True)
    sys.exit(1)

RESULT_PREFIX = "AGENTSAM_RESULT="
MODEL_TAG = "agentsam.bim.model.v1"
MAX_INPUT_BYTES = 512 * 1024 * 1024
DEFAULT_MAX_ELEMENTS = 50_000
HARD_MAX_ELEMENTS = 200_000


def _result(value: dict[str, Any]) -> None:
    print(RESULT_PREFIX + json.dumps(value, separators=(",", ":"), sort_keys=True), flush=True)


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--operation", required=True, choices=("inspect", "validate", "diff", "edit"))
    parser.add_argument("--request", required=True)
    return parser.parse_args()


def _load_request(path_str: str) -> dict[str, Any]:
    value = json.loads(Path(path_str).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("request schema_version must be 1")
    return value


def _scalar(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def _name(entity: Any) -> str | None:
    value = getattr(entity, "Name", None)
    return value if isinstance(value, str) else None


def _predefined(entity: Any) -> str | None:
    value = getattr(entity, "PredefinedType", None)
    return value if isinstance(value, str) and value not in ("NOTDEFINED", "") else None


def _length_unit(model: Any) -> str:
    unit = unit_util.get_project_unit(model, "LENGTHUNIT")
    if unit is None:
        return "METRE"
    prefix = getattr(unit, "Prefix", None) or ""
    return f"{prefix}{getattr(unit, 'Name', 'METRE')}"


def _material(material: Any, scale: float) -> dict[str, Any] | None:
    if material is None:
        return None
    if material.is_a("IfcMaterialLayerSetUsage"):
        material = material.ForLayerSet
    if material.is_a("IfcMaterial"):
        return {"name": material.Name or ""}
    if material.is_a("IfcMaterialLayerSet"):
        layers = []
        for layer in material.MaterialLayers or ():
            thickness = getattr(layer, "LayerThickness", None)
            layers.append({
                "material": (layer.Material.Name if layer.Material else "") or "",
                "thicknessM": float(thickness) * scale if thickness is not None else None,
            })
        return {"name": material.LayerSetName or "LayerSet", "layers": layers}
    if material.is_a("IfcMaterialConstituentSet"):
        parts = [
            {"material": (c.Material.Name if c.Material else "") or "", "thicknessM": None}
            for c in material.MaterialConstituents or ()
        ]
        return {"name": material.Name or "ConstituentSet", "layers": parts}
    if material.is_a("IfcMaterialList"):
        parts = [{"material": m.Name or "", "thicknessM": None} for m in material.Materials or ()]
        return {"name": "MaterialList", "layers": parts}
    return {"name": material.is_a()}


def _psets(entity: Any) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for pset_name, props in element_util.get_psets(entity, psets_only=True).items():
        out[pset_name] = {k: _scalar(v) for k, v in props.items() if k != "id"}
    return out


_QUANTITY_VALUE = {
    "IfcQuantityLength": ("LengthValue", 1),
    "IfcQuantityArea": ("AreaValue", 2),
    "IfcQuantityVolume": ("VolumeValue", 3),
    "IfcQuantityCount": ("CountValue", 0),
    "IfcQuantityWeight": ("WeightValue", 0),
    "IfcQuantityTime": ("TimeValue", 0),
}


def _qtos(entity: Any, scale: float) -> dict[str, dict[str, Any]]:
    """Quantities converted to SI: length x scale, area x scale^2, volume x scale^3."""
    out: dict[str, dict[str, Any]] = {}
    for rel in getattr(entity, "IsDefinedBy", None) or ():
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        definition = rel.RelatingPropertyDefinition
        if definition is None or not definition.is_a("IfcElementQuantity"):
            continue
        bucket = out.setdefault(definition.Name or "Qto", {})
        for quantity in definition.Quantities or ():
            spec = _QUANTITY_VALUE.get(quantity.is_a())
            if spec is None or quantity.Name is None:
                continue
            value = getattr(quantity, spec[0], None)
            bucket[quantity.Name] = float(value) * (scale ** spec[1]) if value is not None and spec[1] else _scalar(value)
    return out


def _has_geometry(entity: Any) -> bool:
    rep = getattr(entity, "Representation", None)
    return bool(rep and any(r.Items for r in rep.Representations or ()))


def _space_container(space: Any) -> Any:
    return element_util.get_container(space) or element_util.get_aggregate(space)


def _spatial_tree(root: Any, scale: float, claimed: set[str], warnings: list[str]) -> dict[str, Any]:
    node: dict[str, Any] = {
        "globalId": root.GlobalId,
        "ifcClass": root.is_a(),
        "name": _name(root),
        "children": [],
    }
    claimed.add(root.GlobalId)
    if root.is_a("IfcBuildingStorey"):
        elevation = getattr(root, "Elevation", None)
        node["elevationM"] = float(elevation) * scale if elevation is not None else None
    for part in element_util.get_parts(root) or ():
        if part.is_a("IfcSpatialStructureElement") and not part.is_a("IfcSpace"):
            if part.GlobalId in claimed:
                warnings.append(f"duplicate spatial GlobalId skipped: {part.GlobalId}")
                continue
            node["children"].append(_spatial_tree(part, scale, claimed, warnings))
    return node


def inspect(request: dict[str, Any]) -> dict[str, Any]:
    source = Path(str(request.get("input", "")))
    if source.suffix.lower() != ".ifc" or not source.is_file():
        raise ValueError("input must be an existing .ifc file")
    size = source.stat().st_size
    if size == 0 or size > MAX_INPUT_BYTES:
        raise ValueError(f"input size {size} outside 1..{MAX_INPUT_BYTES} bytes")
    cap = max(1, min(int(request.get("max_elements", DEFAULT_MAX_ELEMENTS)), HARD_MAX_ELEMENTS))
    output = Path(str(request.get("output", "")))
    if not output.name or output.suffix.lower() != ".json":
        raise ValueError("output must be a .json path")

    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    model = ifcopenshell.open(str(source))
    scale = float(unit_util.calculate_unit_scale(model))
    warnings: list[str] = []
    claimed: set[str] = set()

    projects = model.by_type("IfcProject")
    if not projects:
        raise ValueError("IFC has no IfcProject")
    project = projects[0]
    claimed.add(project.GlobalId)
    spatial = None
    for top in element_util.get_parts(project) or ():
        if top.is_a("IfcSpatialStructureElement") and not top.is_a("IfcSpace"):
            spatial = _spatial_tree(top, scale, claimed, warnings)
            break
    if spatial is None:
        warnings.append("no spatial structure under IfcProject")

    types: list[dict[str, Any]] = []
    type_ids: set[str] = set()
    for t in model.by_type("IfcTypeObject"):
        if t.GlobalId in claimed:
            warnings.append(f"duplicate GlobalId skipped (type): {t.GlobalId}")
            continue
        claimed.add(t.GlobalId)
        type_ids.add(t.GlobalId)
        row: dict[str, Any] = {
            "globalId": t.GlobalId, "ifcClass": t.is_a(), "name": _name(t),
            "predefinedType": _predefined(t), "psets": _psets(t),
        }
        material = _material(element_util.get_material(t), scale)
        if material:
            row["material"] = material
        types.append(row)

    elements: list[dict[str, Any]] = []
    truncated = False
    for el in model.by_type("IfcElement"):
        if len(elements) >= cap:
            truncated = True
            warnings.append(f"element list capped at {cap}")
            break
        if el.GlobalId in claimed:
            warnings.append(f"duplicate GlobalId skipped (element): {el.GlobalId}")
            continue
        claimed.add(el.GlobalId)
        el_type = element_util.get_type(el)
        container = element_util.get_container(el)
        voids = getattr(el, "VoidsElements", None) or ()
        fills = getattr(el, "FillsVoids", None) or ()
        row = {
            "globalId": el.GlobalId, "ifcClass": el.is_a(), "name": _name(el),
            "predefinedType": _predefined(el),
            "typeId": el_type.GlobalId if el_type is not None else None,
            "containerId": container.GlobalId if container is not None else None,
            "psets": _psets(el), "qtos": _qtos(el, scale),
            "hostId": voids[0].RelatingBuildingElement.GlobalId if voids else None,
            "openingIds": [r.RelatedOpeningElement.GlobalId for r in getattr(el, "HasOpenings", None) or ()],
            "fillsOpeningId": fills[0].RelatingOpeningElement.GlobalId if fills else None,
        }
        material = _material(element_util.get_material(el), scale)
        if material:
            row["material"] = material
        elements.append(row)

    spaces: list[dict[str, Any]] = []
    for sp in model.by_type("IfcSpace"):
        if sp.GlobalId in claimed:
            warnings.append(f"duplicate GlobalId skipped (space): {sp.GlobalId}")
            continue
        claimed.add(sp.GlobalId)
        qto = _qtos(sp, scale).get("Qto_SpaceBaseQuantities", {})
        container = _space_container(sp)
        spaces.append({
            "globalId": sp.GlobalId, "name": _name(sp),
            "longName": sp.LongName if isinstance(getattr(sp, "LongName", None), str) else None,
            "containerId": container.GlobalId if container is not None else None,
            "usage": _predefined(sp) or (sp.ObjectType if isinstance(sp.ObjectType, str) else None),
            "netFloorAreaM2": qto.get("NetFloorArea"), "grossFloorAreaM2": qto.get("GrossFloorArea"),
            "heightM": qto.get("Height"), "hasGeometry": _has_geometry(sp),
        })

    # Referential cleanup: a reference to something outside this model (capped
    # list, detached container) becomes null/removed with a warning, never dangling.
    element_ids = {e["globalId"] for e in elements}
    spatial_ids: set[str] = set()

    def collect(node: dict[str, Any]) -> None:
        spatial_ids.add(node["globalId"])
        for child in node["children"]:
            collect(child)

    if spatial:
        collect(spatial)
    containers = spatial_ids | {s["globalId"] for s in spaces}
    for e in elements:
        if e["typeId"] is not None and e["typeId"] not in type_ids:
            warnings.append(f"unresolved type ref on {e['globalId']}")
            e["typeId"] = None
        if e["containerId"] is not None and e["containerId"] not in containers:
            warnings.append(f"unresolved container ref on {e['globalId']}")
            e["containerId"] = None
        if e["hostId"] is not None and e["hostId"] not in element_ids:
            warnings.append(f"unresolved host ref on {e['globalId']}")
            e["hostId"] = None
        if e["fillsOpeningId"] is not None and e["fillsOpeningId"] not in element_ids:
            warnings.append(f"unresolved fill ref on {e['globalId']}")
            e["fillsOpeningId"] = None
        e["openingIds"] = [i for i in e["openingIds"] if i in element_ids]
    for s in spaces:
        if s["containerId"] is not None and s["containerId"] not in spatial_ids:
            warnings.append(f"unresolved space container on {s['globalId']}")
            s["containerId"] = None

    counts: dict[str, int] = {}
    for eid in model.wrapped_data.entity_names():
        cls = model.by_id(eid).is_a()
        counts[cls] = counts.get(cls, 0) + 1

    document = {
        "schema": MODEL_TAG,
        "source": {"ifcSchema": model.schema, "sha256": digest, "byteLength": size},
        "project": {"globalId": project.GlobalId, "name": _name(project),
                    "lengthUnit": _length_unit(model), "lengthScaleToM": scale},
        "spatial": spatial, "types": types, "elements": elements, "spaces": spaces,
        "counts": dict(sorted(counts.items())), "truncated": truncated, "warnings": warnings,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=1, sort_keys=True), encoding="utf-8")
    return {
        "ok": True, "operation": "inspect", "output": str(output),
        "metrics": {"elements": len(elements), "types": len(types), "spaces": len(spaces),
                    "storeys": counts.get("IfcBuildingStorey", 0),
                    "warnings": len(warnings), "truncated": truncated},
        "ifc_schema": model.schema, "ifcopenshell": ifcopenshell.version,
    }


# ---------------------------------------------------------------------------
# validate / diff / edit
# ---------------------------------------------------------------------------

MAX_EDITS = 500
MAX_ISSUES = 200
MAX_DIFF_ELEMENTS = 1000
NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_ .:-]{0,127}$")
GUID_PATTERN = re.compile(r"^[0-9A-Za-z_$]{22}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
EDITABLE_ATTRIBUTES = ("Name", "Description", "ObjectType", "LongName", "Tag")
PROTECTED_CLASSES = ("IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey")
DIFF_ATTRIBUTES = ("Name", "Description", "ObjectType", "LongName", "Tag", "PredefinedType")
GEOMETRY_NOTE = (
    "Geometry is compared for object placement and for single-extrusion bodies "
    "(depth and rectangular profile). Other representations are compared by item "
    "class only, so a change inside them is not detected."
)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _open_ifc(path_str: Any, label: str) -> tuple[Any, Path]:
    if not isinstance(path_str, str) or not path_str:
        raise ValueError(f"{label}_path_required")
    path = Path(path_str)
    if not path.is_file():
        raise ValueError(f"{label}_not_found")
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError(f"{label}_too_large")
    return ifcopenshell.open(str(path)), path


def _normalise_message(text: str) -> str:
    return re.sub(r"#\d+", "#", text)


def _validation_issues(model: Any) -> list[dict[str, str]]:
    import ifcopenshell.validate as validator

    logger = validator.json_logger()
    validator.validate(model, logger, express_rules=False)
    issues = []
    for statement in logger.statements:
        issues.append({
            "level": str(statement.get("level", "")).upper(),
            "message": str(statement.get("message", ""))[:300],
            "instance": str(statement.get("instance", ""))[:160],
        })
    return issues


def _issue_counts(issues: list[dict[str, str]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for issue in issues:
        counts[issue["level"]] = counts.get(issue["level"], 0) + 1
    return dict(sorted(counts.items()))


def _introduced_issues(before: list[dict[str, str]], after: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: dict[tuple[str, str], int] = {}
    for issue in before:
        key = (issue["level"], _normalise_message(issue["message"]))
        seen[key] = seen.get(key, 0) + 1
    introduced = []
    for issue in after:
        key = (issue["level"], _normalise_message(issue["message"]))
        if seen.get(key, 0) > 0:
            seen[key] -= 1
        else:
            introduced.append(issue)
    return introduced


def validate(request: dict[str, Any]) -> dict[str, Any]:
    model, path = _open_ifc(request.get("input"), "input")
    issues = _validation_issues(model)
    errors = [i for i in issues if i["level"] in ("ERROR", "CRITICAL")]
    return {
        "schema": "agentsam.bim.validation.v1",
        "source": {"ifcSchema": model.schema, "sha256": _sha256_file(path)},
        "valid": len(errors) == 0,
        "counts": _issue_counts(issues),
        "issues": issues[:MAX_ISSUES],
        "truncated": len(issues) > MAX_ISSUES,
        "scope": "IfcOpenShell schema validation without EXPRESS rules. Not code compliance, not an IDS check.",
    }


def _round(value: float) -> float:
    return round(float(value), 6) + 0.0


def _matrix_m(element: Any, scale: float) -> list[float] | None:
    import ifcopenshell.util.placement as placement_util

    if not getattr(element, "ObjectPlacement", None):
        return None
    matrix = placement_util.get_local_placement(element.ObjectPlacement)
    out = []
    for r in range(4):
        for c in range(4):
            out.append(_round(matrix[r][c] * (scale if (c == 3 and r < 3) else 1.0)))
    return out


def _body_items(element: Any) -> list[Any] | None:
    representation = getattr(element, "Representation", None)
    if not representation:
        return None
    items: list[Any] = []
    for rep in representation.Representations:
        if rep.RepresentationIdentifier == "Body":
            items.extend(rep.Items)
    return items or None


def _geometry_summary(element: Any, scale: float) -> list[list[Any]] | None:
    items = _body_items(element)
    if items is None:
        return None
    summary: list[list[Any]] = []
    for item in items:
        if item.is_a("IfcExtrudedAreaSolid"):
            profile = item.SweptArea
            dims: list[Any] = [profile.is_a()]
            if profile.is_a("IfcRectangleProfileDef"):
                dims += [_round(profile.XDim * scale), _round(profile.YDim * scale)]
            summary.append(["IfcExtrudedAreaSolid", _round(item.Depth * scale), *dims])
        else:
            summary.append([item.is_a()])
    return summary


def _snapshot(model: Any) -> dict[str, dict[str, Any]]:
    import ifcopenshell.util.element as util_element

    scale = unit_util.calculate_unit_scale(model)
    snapshot: dict[str, dict[str, Any]] = {}
    for element in model.by_type("IfcObjectDefinition"):
        guid = element.GlobalId
        if guid in snapshot:
            raise ValueError(f"duplicate_global_id:{guid}")
        attributes = {}
        for name in DIFF_ATTRIBUTES:
            try:
                attributes[name] = _scalar(getattr(element, name))
            except AttributeError:
                continue
        type_obj = util_element.get_type(element)
        container = util_element.get_container(element)
        aggregate = util_element.get_aggregate(element)
        record: dict[str, Any] = {
            "ifcClass": element.is_a(),
            "attributes": attributes,
            "psets": _clean_sets(util_element.get_psets(element, psets_only=True)),
            "qtos": _clean_sets(util_element.get_psets(element, qtos_only=True)),
            "typeId": type_obj.GlobalId if type_obj else None,
            "containerId": container.GlobalId if container else None,
            "aggregateId": aggregate.GlobalId if aggregate else None,
        }
        if element.is_a("IfcProduct"):
            record["placement"] = _matrix_m(element, scale)
            record["geometry"] = _geometry_summary(element, scale)
        snapshot[guid] = record
    return snapshot


def _clean_sets(sets: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for name, props in sets.items():
        cleaned[name] = {k: _scalar(v) for k, v in props.items() if k != "id"}
    return cleaned


def _leaves(prefix: str, value: Any, out: dict[str, Any]) -> None:
    if isinstance(value, dict):
        for key, inner in value.items():
            _leaves(f"{prefix}.{key}" if prefix else str(key), inner, out)
    else:
        out[prefix] = value


def diff_snapshots(before: dict[str, dict[str, Any]], after: dict[str, dict[str, Any]]) -> dict[str, Any]:
    added = sorted(g for g in after if g not in before)
    removed = sorted(g for g in before if g not in after)
    changed: list[dict[str, Any]] = []
    unchanged = 0
    for guid in sorted(before.keys() & after.keys()):
        old_leaves: dict[str, Any] = {}
        new_leaves: dict[str, Any] = {}
        _leaves("", before[guid], old_leaves)
        _leaves("", after[guid], new_leaves)
        fields = {}
        for key in sorted(old_leaves.keys() | new_leaves.keys()):
            if old_leaves.get(key) != new_leaves.get(key):
                fields[key] = {"from": old_leaves.get(key), "to": new_leaves.get(key)}
        if fields:
            changed.append({
                "globalId": guid, "ifcClass": after[guid]["ifcClass"],
                "name": after[guid]["attributes"].get("Name"), "fields": fields,
            })
        else:
            unchanged += 1
    return {
        "added": [{"globalId": g, "ifcClass": after[g]["ifcClass"], "name": after[g]["attributes"].get("Name")}
                  for g in added[:MAX_DIFF_ELEMENTS]],
        "removed": [{"globalId": g, "ifcClass": before[g]["ifcClass"], "name": before[g]["attributes"].get("Name")}
                    for g in removed[:MAX_DIFF_ELEMENTS]],
        "changed": changed[:MAX_DIFF_ELEMENTS],
        "counts": {"added": len(added), "removed": len(removed), "changed": len(changed), "unchanged": unchanged},
        "truncated": max(len(added), len(removed), len(changed)) > MAX_DIFF_ELEMENTS,
        "compared": ["attributes", "psets", "qtos", "type", "container", "aggregate", "placement", "geometry"],
        "not_compared": GEOMETRY_NOTE,
    }


def diff(request: dict[str, Any]) -> dict[str, Any]:
    first, first_path = _open_ifc(request.get("input"), "input")
    second, second_path = _open_ifc(request.get("other"), "other")
    result = diff_snapshots(_snapshot(first), _snapshot(second))
    result["schema"] = "agentsam.bim.diff.v1"
    result["input"] = {"ifcSchema": first.schema, "sha256": _sha256_file(first_path)}
    result["other"] = {"ifcSchema": second.schema, "sha256": _sha256_file(second_path)}
    result["identity_preserved"] = result["counts"]["removed"] == 0 and result["counts"]["added"] == 0
    return result


# -- edit ------------------------------------------------------------------


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label}_must_be_finite_number")
    return float(value)


def _element(model: Any, edit: dict[str, Any]) -> Any:
    guid = edit.get("globalId")
    if not isinstance(guid, str) or not GUID_PATTERN.match(guid):
        raise ValueError("global_id_invalid")
    try:
        element = model.by_guid(guid)
    except RuntimeError as err:
        raise ValueError(f"unknown_global_id:{guid}") from err
    if not element.is_a("IfcObjectDefinition"):
        raise ValueError(f"not_an_object:{guid}")
    return element


def _own_pset(element: Any, name: str) -> Any:
    for rel in getattr(element, "IsDefinedBy", None) or []:
        if rel.is_a("IfcRelDefinesByProperties"):
            definition = rel.RelatingPropertyDefinition
            if definition.is_a("IfcPropertySet") and definition.Name == name:
                return definition
    return None


def _edit_attribute(model: Any, edit: dict[str, Any]) -> tuple[Any, set[str]]:
    import ifcopenshell.api

    element = _element(model, edit)
    attribute = edit.get("attribute")
    if attribute not in EDITABLE_ATTRIBUTES:
        raise ValueError(f"attribute_not_editable:{attribute}")
    value = edit.get("value")
    if value is not None and not isinstance(value, str):
        raise ValueError("attribute_value_must_be_string_or_null")
    names = [a.name() for a in element.wrapped_data.declaration().as_entity().all_attributes()]
    if attribute not in names:
        raise ValueError(f"attribute_not_on_class:{element.is_a()}.{attribute}")
    ifcopenshell.api.run("attribute.edit_attributes", model, product=element, attributes={attribute: value})
    return element, {element.GlobalId}


def _edit_property(model: Any, edit: dict[str, Any], remove: bool) -> tuple[Any, set[str]]:
    import ifcopenshell.api

    element = _element(model, edit)
    pset_name, prop = edit.get("pset"), edit.get("name")
    if not (isinstance(pset_name, str) and NAME_PATTERN.match(pset_name)):
        raise ValueError("pset_name_invalid")
    if not (isinstance(prop, str) and NAME_PATTERN.match(prop)):
        raise ValueError("property_name_invalid")
    if pset_name.startswith("Qto_") or pset_name.endswith("BaseQuantities"):
        raise ValueError("quantity_sets_are_derived_and_not_editable")
    pset = _own_pset(element, pset_name)
    if remove:
        if pset is None:
            raise ValueError(f"pset_not_found:{pset_name}")
        ifcopenshell.api.run("pset.edit_pset", model, pset=pset, properties={prop: None})
        if not getattr(pset, "HasProperties", None):
            ifcopenshell.api.run("pset.remove_pset", model, product=element, pset=pset)
        return element, {element.GlobalId}
    value = edit.get("value")
    if isinstance(value, float):
        _finite(value, "property_value")
    elif not isinstance(value, (bool, int, str)):
        raise ValueError("property_value_must_be_string_number_or_boolean")
    if pset is None:
        pset = ifcopenshell.api.run("pset.add_pset", model, product=element, name=pset_name)
    ifcopenshell.api.run("pset.edit_pset", model, pset=pset, properties={prop: value})
    return element, {element.GlobalId}


def _placement_descendants(model: Any, element: Any) -> set[str]:
    root = element.ObjectPlacement
    found: set[str] = set()
    if root is None:
        return found
    for product in model.by_type("IfcProduct"):
        placement = getattr(product, "ObjectPlacement", None)
        while placement is not None:
            parent = getattr(placement, "PlacementRelTo", None)
            if parent is not None and parent == root:
                found.add(product.GlobalId)
                break
            placement = parent
    return found


def _edit_move(model: Any, edit: dict[str, Any]) -> tuple[Any, set[str]]:
    import ifcopenshell.api
    import ifcopenshell.util.placement as placement_util

    element = _element(model, edit)
    if not element.is_a("IfcProduct") or getattr(element, "ObjectPlacement", None) is None:
        raise ValueError("element_has_no_placement")
    delta = edit.get("delta_m")
    if not isinstance(delta, list) or len(delta) != 3:
        raise ValueError("delta_m_must_be_three_numbers")
    vector = [_finite(v, "delta_m") for v in delta]
    if any(abs(v) > 100_000 for v in vector):
        raise ValueError("delta_m_out_of_range")
    with_children = edit.get("with_children", True)
    if not isinstance(with_children, bool):
        raise ValueError("with_children_must_be_boolean")
    scale = unit_util.calculate_unit_scale(model)
    descendants = _placement_descendants(model, element) if with_children else set()
    matrix = placement_util.get_local_placement(element.ObjectPlacement).copy()
    matrix[:3, 3] = matrix[:3, 3] * scale + vector
    ifcopenshell.api.run("geometry.edit_object_placement", model, product=element, matrix=matrix,
                         is_si=True, should_transform_children=with_children)
    return element, {element.GlobalId} | descendants


def _edit_extrusion_depth(model: Any, edit: dict[str, Any]) -> tuple[Any, set[str]]:
    element = _element(model, edit)
    depth_m = _finite(edit.get("depth_m"), "depth_m")
    if depth_m <= 0 or depth_m > 10_000:
        raise ValueError("depth_m_out_of_range")
    items = _body_items(element)
    if items is None or len(items) != 1 or not items[0].is_a("IfcExtrudedAreaSolid"):
        raise ValueError("unsupported_representation:body_is_not_a_single_extrusion")
    solid = items[0]
    ratios = [float(v) for v in solid.ExtrudedDirection.DirectionRatios]
    if len(ratios) != 3 or abs(ratios[0]) > 1e-9 or abs(ratios[1]) > 1e-9 or abs(ratios[2] - 1.0) > 1e-9:
        raise ValueError("unsupported_representation:extrusion_not_along_local_z")
    if len(model.get_inverse(solid)) > 1:
        raise ValueError("unsupported_representation:solid_shared_by_other_objects")
    solid.Depth = depth_m / unit_util.calculate_unit_scale(model)
    return element, {element.GlobalId}


def _edit_remove(model: Any, edit: dict[str, Any]) -> tuple[Any, set[str], set[str]]:
    import ifcopenshell.api

    element = _element(model, edit)
    if element.is_a() in PROTECTED_CLASSES or not element.is_a("IfcProduct"):
        raise ValueError(f"element_not_removable:{element.is_a()}")
    openings = [rel.RelatedOpeningElement for rel in getattr(element, "HasOpenings", None) or []]
    fills = [rel.RelatedBuildingElement for op in openings for rel in getattr(op, "HasFillings", None) or []]
    if fills and edit.get("cascade") is not True:
        raise ValueError("element_has_hosted_fillings:set_cascade_true_to_remove_them")
    cascaded = {o.GlobalId for o in openings} | {f.GlobalId for f in fills}
    guid = element.GlobalId
    for fill in fills:
        ifcopenshell.api.run("root.remove_product", model, product=fill)
    for opening in openings:
        ifcopenshell.api.run("root.remove_product", model, product=opening)
    ifcopenshell.api.run("root.remove_product", model, product=element)
    return guid, {guid}, cascaded


EDIT_OPERATIONS = (
    "attribute.set", "property.set", "property.remove", "placement.move",
    "solid.extrusion_depth", "element.remove",
)


def edit(request: dict[str, Any]) -> dict[str, Any]:
    source_path = Path(str(request.get("input") or ""))
    output_path = Path(str(request.get("output") or ""))
    base = request.get("base_sha256")
    edits = request.get("edits")
    if not isinstance(base, str) or not SHA256_PATTERN.match(base):
        raise ValueError("base_sha256_required")
    if not isinstance(edits, list) or not 1 <= len(edits) <= MAX_EDITS:
        raise ValueError(f"edits_must_be_1_to_{MAX_EDITS}")
    if not request.get("output") or output_path.suffix.lower() != ".ifc":
        raise ValueError("output_must_be_an_ifc_path")
    if output_path.exists() or (source_path.exists() and output_path.resolve() == source_path.resolve()):
        raise ValueError("output_exists_edit_never_overwrites")
    model, source_path = _open_ifc(request.get("input"), "input")
    digest = _sha256_file(source_path)
    if digest != base:
        raise ValueError("ifc_edit_base_conflict")
    original = ifcopenshell.open(str(source_path))
    before_snapshot = _snapshot(original)
    before_issues = _validation_issues(model)

    touched: set[str] = set()
    removed: set[str] = set()
    cascaded: set[str] = set()
    applied: list[dict[str, Any]] = []
    for index, item in enumerate(edits):
        if not isinstance(item, dict) or item.get("op") not in EDIT_OPERATIONS:
            raise ValueError(f"edit[{index}]: op_must_be_one_of:{','.join(EDIT_OPERATIONS)}")
        op = item["op"]
        try:
            if op == "attribute.set":
                _, ids = _edit_attribute(model, item)
            elif op == "property.set":
                _, ids = _edit_property(model, item, remove=False)
            elif op == "property.remove":
                _, ids = _edit_property(model, item, remove=True)
            elif op == "placement.move":
                _, ids = _edit_move(model, item)
            elif op == "solid.extrusion_depth":
                _, ids = _edit_extrusion_depth(model, item)
            else:
                _, ids, extra = _edit_remove(model, item)
                removed |= ids
                cascaded |= extra
        except ValueError as err:
            raise ValueError(f"edit[{index}] {op}: {err}") from err
        touched |= ids
        applied.append({"index": index, "op": op, "globalId": item.get("globalId")})

    introduced = [i for i in _introduced_issues(before_issues, _validation_issues(model))
                  if i["level"] in ("ERROR", "CRITICAL")]
    if introduced:
        raise ValueError("edit_introduced_validation_errors:" + json.dumps(introduced[:5]))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(suffix=".ifc", dir=str(output_path.parent))
    os.close(handle)
    temp_path = Path(temp_name)
    try:
        model.write(str(temp_path))
        reopened = ifcopenshell.open(str(temp_path))
        result = diff_snapshots(before_snapshot, _snapshot(reopened))
        collateral = [c["globalId"] for c in result["changed"] if c["globalId"] not in touched]
        gone = [r["globalId"] for r in result["removed"] if r["globalId"] not in removed | cascaded]
        if collateral or gone or result["counts"]["added"]:
            raise ValueError("edit_changed_objects_outside_the_request:" + json.dumps({
                "changed": collateral[:10], "removed": gone[:10], "added": result["counts"]["added"]}))
        os.replace(temp_path, output_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    return {
        "schema": "agentsam.bim.edit.v1",
        "source": {"ifcSchema": original.schema, "sha256": digest},
        "output": {"path": str(output_path), "sha256": _sha256_file(output_path),
                   "bytes": output_path.stat().st_size},
        "applied": applied,
        "diff": result,
        "validation": {"before": _issue_counts(before_issues), "introduced_errors": 0},
        "guarantees": ["source untouched", "every GlobalId preserved except explicit removals",
                       "no change outside the edited objects", "no new validation errors"],
    }


def main() -> None:
    args = _args()
    try:
        request = _load_request(args.request)
        if args.operation == "inspect":
            _result(inspect(request))
        else:
            handler = {"validate": validate, "diff": diff, "edit": edit}[args.operation]
            _result({"ok": True, "operation": args.operation, "data": handler(request)})
    except Exception as err:  # structured failure, never a traceback to the caller
        _result({"ok": False, "error": f"{type(err).__name__}: {err}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
