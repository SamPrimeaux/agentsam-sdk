#!/usr/bin/env python3
"""Fixed IfcOpenShell-side adapter for AgentSam BIM semantics.

Executed in a Python environment that has ifcopenshell (the CAD container venv,
or any local interpreter with it installed). Accepts a bounded JSON request with
allowlisted operations; never evaluates user-provided code.

Operations
  inspect  Read an IFC and write an `agentsam.bim.model.v1` document: spatial
           tree, types, materials, property sets, quantities, the
           wall -> opening -> door chain and spaces, all keyed by GlobalId.

Typed fields are SI (meters, square meters). Property-set values are returned as
authored in the file: the IFC does not say which numeric properties are lengths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
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
    parser.add_argument("--operation", required=True, choices=("inspect",))
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


def main() -> None:
    args = _args()
    try:
        request = _load_request(args.request)
        if args.operation == "inspect":
            _result(inspect(request))
    except Exception as err:  # structured failure, never a traceback to the caller
        _result({"ok": False, "error": f"{type(err).__name__}: {err}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
