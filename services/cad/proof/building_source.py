"""Read a bounded rectangular-building subset of the existing cad.project.v2 model.

This is not a second CAD document format and deliberately rejects geometry that
this proof's six engines cannot faithfully author. Exact files are read locally
by a runtime with access to the caller-authorized resource; no SDK roots.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

INCHES_PER_UNIT = {"in": 1.0, "mm": 1.0 / 25.4, "cm": 1.0 / 2.54, "m": 100.0 / 2.54, "ft": 12.0}
MAX_SOURCE_BYTES = 2 * 1024 * 1024


def _positive_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(f"cad_building_invalid_{field}")
    return float(value)


def _nonnegative_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"cad_building_invalid_{field}")
    return float(value)


def _identifier(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 160 or not value[0].isalnum() or any(not (c.isalnum() or c in "_:-.") for c in value):
        raise ValueError(f"cad_building_invalid_{field}")
    return value


def load_building_source(path: str | Path, expected_hash: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    target = Path(path)
    if not target.is_file() or target.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("cad_building_source_missing_or_too_large")
    raw = target.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected_hash is not None and (len(expected_hash) != 64 or expected_hash.lower() != digest):
        raise ValueError("cad_building_source_revision_conflict")
    try:
        doc = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("cad_building_source_json_invalid") from exc
    if not isinstance(doc, dict) or doc.get("schema") != "cad.project.v2" or doc.get("domain") != "architecture.building":
        raise ValueError("cad_building_project_v2_architecture_required")
    identity = _identifier(doc.get("id"), "project_id")
    revision = doc.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        raise ValueError("cad_building_revision_invalid")
    system = doc.get("coordinateSystem") or {}
    units = system.get("unit")
    if units not in INCHES_PER_UNIT or system.get("upAxis") != "Z" or system.get("handedness") != "right":
        raise ValueError("cad_building_coordinate_system_unsupported")
    scale = INCHES_PER_UNIT[units]
    geometry = doc.get("geometry") or {}
    entities = geometry.get("entities")
    if not isinstance(entities, list):
        raise ValueError("cad_building_geometry_entities_required")
    by_id: dict[str, dict] = {}
    for entity in entities:
        if not isinstance(entity, dict):
            raise ValueError("cad_building_geometry_entity_invalid")
        key = _identifier(entity.get("id"), "entity_id")
        if key in by_id:
            raise ValueError("cad_building_duplicate_entity")
        by_id[key] = entity
    architecture = (doc.get("modules") or {}).get("architecture") or {}
    if architecture.get("schema") != "cad.module.architecture.v1" or architecture.get("version") != 1:
        raise ValueError("cad_building_architecture_module_required")
    spec = (architecture.get("extensions") or {}).get("iamscene.building-shell.v1")
    if not isinstance(spec, dict):
        raise ValueError("cad_building_shell_extension_required")
    shell_id = _identifier(spec.get("shellEntityId"), "shell_ref")
    shell = by_id.get(shell_id)
    if not shell or shell.get("kind") != "architecture.shell" or not isinstance(shell.get("properties"), dict):
        raise ValueError("cad_building_shell_entity_required")
    dimensions = shell["properties"]
    p: dict[str, Any] = {
        "length": _positive_number(dimensions.get("length"), "length") * scale,
        "width": _positive_number(dimensions.get("width"), "width") * scale,
        "height": _positive_number(dimensions.get("height"), "height") * scale,
        "wall": _positive_number(dimensions.get("wallThickness"), "wall") * scale,
    }
    # The output sheet is ARCH E (48 x 36 inches) at 3/16 inch per foot.
    # Reject models that exceed its drawing region rather than export a clipped plan.
    if p["length"] > 2800 or p["width"] > 2100 or p["height"] > 3000 or p["wall"] * 2 >= min(p["length"],p["width"]):
        raise ValueError("cad_building_shell_dimensions_unsupported")
    fps, frames = spec.get("fps", 12), spec.get("frames", 24)
    if not isinstance(fps, int) or isinstance(fps, bool) or not (1 <= fps <= 60) or not isinstance(frames,int) or isinstance(frames,bool) or not (1 <= frames <= 48):
        raise ValueError("cad_building_media_bounds_invalid")
    p["fps"],p["frames"] = fps,frames
    opening_ids=spec.get("openingEntityIds")
    if not isinstance(opening_ids,list) or len(opening_ids) > 80 or len(set(opening_ids)) != len(opening_ids):
        raise ValueError("cad_building_opening_references_invalid")
    openings=[]
    for oid in opening_ids:
        e=by_id.get(_identifier(oid,"opening_ref"))
        if not e or e.get("kind") != "architecture.opening" or not isinstance(e.get("properties"),dict):
            raise ValueError("cad_building_opening_entity_required")
        fields=e["properties"]
        kind,side=fields.get("type"),fields.get("wall")
        if kind not in ("door","window") or side not in ("north","south"):
            raise ValueError("cad_building_opening_kind_or_wall_unsupported")
        o={"id":oid,"kind":kind,"wall":side,
           "x":_nonnegative_number(fields.get("x"),"opening_x")*scale,
           "sill":_nonnegative_number(fields.get("sill"),"opening_sill")*scale,
           "width":_positive_number(fields.get("width"),"opening_width")*scale,
           "height":_positive_number(fields.get("height"),"opening_height")*scale}
        if o["x"]+o["width"] > p["length"]+1e-9 or o["sill"]+o["height"] > p["height"]+1e-9:
            raise ValueError("cad_building_opening_outside_wall")
        openings.append(o)
    for i,left in enumerate(openings):
        for right in openings[i+1:]:
            if left["wall"] != right["wall"]:
                continue
            horizontal = left["x"] < right["x"]+right["width"] and right["x"] < left["x"]+left["width"]
            vertical = left["sill"] < right["sill"]+right["height"] and right["sill"] < left["sill"]+left["height"]
            if horizontal and vertical:
                raise ValueError("cad_building_openings_overlap")
    p["openings"]=openings
    storeys=architecture.get("storeys",[])
    if not isinstance(storeys,list) or len(storeys)!=1 or any(i not in storeys[0].get("elementIds",[]) for i in [shell_id,*opening_ids]):
        raise ValueError("cad_building_single_storey_membership_required")
    if set(by_id) != {shell_id,*opening_ids}:
        raise ValueError("cad_building_unhandled_entities")
    sites=architecture.get("sites",[])
    buildings=architecture.get("buildings",[])
    if not isinstance(sites,list) or len(sites)!=1 or not isinstance(buildings,list) or len(buildings)!=1 or buildings[0].get("siteId")!=sites[0].get("id") or storeys[0].get("buildingId")!=buildings[0].get("id"):
        raise ValueError("cad_building_spatial_hierarchy_invalid")
    evidence={"schema":"cad.project.v2","source_sha256":digest,"source_id":identity,
              "source_revision":revision,"source_units":units,"shell_entity_id":shell_id,
              "site_id":_identifier(sites[0].get("id"),"site_id"),
              "building_id":_identifier(buildings[0].get("id"),"building_id"),
              "storey_id":_identifier(storeys[0].get("id"),"storey_id"),
              "opening_entity_ids":opening_ids,"scope":"single_rectangular_shell_with_north_south_openings"}
    return p,evidence
