#!/usr/bin/env python3
"""Fixed Blender-side adapter for AgentSam typed CAD capabilities.

This file is executed by Blender, not by the host Python runtime. It accepts a
bounded JSON request and exposes an allowlisted modeling vocabulary. It never
evaluates user-provided Python or arbitrary Blender expressions.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import traceback
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector

RESULT_PREFIX = "AGENTSAM_RESULT="
MAX_OPERATIONS = 256
MAX_NAME = 160
PRIMITIVES = {"cube", "uv_sphere", "ico_sphere", "cylinder", "cone", "plane", "torus"}
BOOLEAN_OPERATIONS = {"UNION", "DIFFERENCE", "INTERSECT"}
RENDER_ENGINES = {"BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH", "CYCLES"}


def _result(value: dict[str, Any]) -> None:
    print(RESULT_PREFIX + json.dumps(value, separators=(",", ":"), sort_keys=True), flush=True)


def _args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--operation", required=True, choices=("inspect", "build", "render_preview", "export"))
    parser.add_argument("--request", required=True)
    return parser.parse_args(argv)


def _load_request(path: str) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("request schema_version must be 1")
    return value


def _name(value: Any, label: str = "name") -> str:
    text = str(value or "").strip()
    if not text or len(text) > MAX_NAME or "\x00" in text:
        raise ValueError(f"{label} must be 1..{MAX_NAME} characters")
    return text


def _number(value: Any, label: str, *, minimum: float | None = None, maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be a finite number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{label} must be a finite number")
    if minimum is not None and result < minimum:
        raise ValueError(f"{label} must be >= {minimum}")
    if maximum is not None and result > maximum:
        raise ValueError(f"{label} must be <= {maximum}")
    return result


def _integer(value: Any, label: str, *, minimum: int, maximum: int) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be an integer") from exc
    if result < minimum or result > maximum:
        raise ValueError(f"{label} must be {minimum}..{maximum}")
    return result


def _vec(value: Any, label: str, size: int = 3, default: list[float] | None = None) -> list[float]:
    if value is None and default is not None:
        return list(default)
    if not isinstance(value, (list, tuple)) or len(value) != size:
        raise ValueError(f"{label} must contain {size} numbers")
    return [_number(item, f"{label}[{index}]") for index, item in enumerate(value)]


def _object(name: Any) -> bpy.types.Object:
    key = _name(name, "object")
    obj = bpy.data.objects.get(key)
    if obj is None:
        raise ValueError(f"object not found: {key}")
    return obj


def _activate(obj: bpy.types.Object) -> None:
    if bpy.context.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except RuntimeError:
            pass
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    _activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def _set_transform(obj: bpy.types.Object, op: dict[str, Any]) -> None:
    if "location" in op:
        obj.location = _vec(op["location"], "location")
    if "rotation" in op:
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = _vec(op["rotation"], "rotation")
    if "scale" in op:
        obj.scale = _vec(op["scale"], "scale")


def _add_primitive(op: dict[str, Any]) -> bpy.types.Object:
    primitive = str(op.get("primitive") or "").strip().lower()
    if primitive not in PRIMITIVES:
        raise ValueError(f"unsupported primitive: {primitive or '<empty>'}")
    location = _vec(op.get("location"), "location", default=[0, 0, 0])
    rotation = _vec(op.get("rotation"), "rotation", default=[0, 0, 0])

    if primitive == "cube":
        bpy.ops.mesh.primitive_cube_add(size=_number(op.get("size", 2), "size", minimum=1e-9), location=location, rotation=rotation)
    elif primitive == "uv_sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=_integer(op.get("segments", 32), "segments", minimum=3, maximum=512),
            ring_count=_integer(op.get("rings", 16), "rings", minimum=3, maximum=256),
            radius=_number(op.get("radius", 1), "radius", minimum=1e-9),
            location=location,
            rotation=rotation,
        )
    elif primitive == "ico_sphere":
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=_integer(op.get("subdivisions", 2), "subdivisions", minimum=1, maximum=8),
            radius=_number(op.get("radius", 1), "radius", minimum=1e-9),
            location=location,
            rotation=rotation,
        )
    elif primitive == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=_integer(op.get("vertices", 32), "vertices", minimum=3, maximum=512),
            radius=_number(op.get("radius", 1), "radius", minimum=1e-9),
            depth=_number(op.get("depth", 2), "depth", minimum=1e-9),
            location=location,
            rotation=rotation,
        )
    elif primitive == "cone":
        bpy.ops.mesh.primitive_cone_add(
            vertices=_integer(op.get("vertices", 32), "vertices", minimum=3, maximum=512),
            radius1=_number(op.get("radius1", 1), "radius1", minimum=0),
            radius2=_number(op.get("radius2", 0), "radius2", minimum=0),
            depth=_number(op.get("depth", 2), "depth", minimum=1e-9),
            location=location,
            rotation=rotation,
        )
    elif primitive == "plane":
        bpy.ops.mesh.primitive_plane_add(size=_number(op.get("size", 2), "size", minimum=1e-9), location=location, rotation=rotation)
    elif primitive == "torus":
        bpy.ops.mesh.primitive_torus_add(
            major_segments=_integer(op.get("major_segments", 48), "major_segments", minimum=3, maximum=512),
            minor_segments=_integer(op.get("minor_segments", 12), "minor_segments", minimum=3, maximum=256),
            major_radius=_number(op.get("major_radius", 1), "major_radius", minimum=1e-9),
            minor_radius=_number(op.get("minor_radius", 0.25), "minor_radius", minimum=1e-9),
            location=location,
            rotation=rotation,
        )
    else:  # pragma: no cover - guarded above
        raise ValueError("unreachable primitive")

    obj = bpy.context.active_object
    obj.name = _name(op.get("name") or primitive, "name")
    if "scale" in op:
        obj.scale = _vec(op["scale"], "scale")
    return obj


def _op_clear_scene(op: dict[str, Any]) -> None:
    if op.get("op") != "clear_scene":
        raise ValueError("invalid clear operation")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def _op_duplicate(op: dict[str, Any]) -> None:
    source = _object(op.get("object"))
    duplicate = source.copy()
    duplicate.data = source.data.copy() if source.data else None
    duplicate.name = _name(op.get("name") or f"{source.name}_copy", "name")
    bpy.context.collection.objects.link(duplicate)
    _set_transform(duplicate, op)


def _op_delete(op: dict[str, Any]) -> None:
    obj = _object(op.get("object"))
    bpy.data.objects.remove(obj, do_unlink=True)


def _op_join(op: dict[str, Any]) -> None:
    names = op.get("objects")
    if not isinstance(names, list) or len(names) < 2 or len(names) > 128:
        raise ValueError("join.objects must contain 2..128 object names")
    objects = [_object(value) for value in names]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    if op.get("name"):
        objects[0].name = _name(op["name"])


def _op_bevel(op: dict[str, Any]) -> None:
    obj = _object(op.get("object"))
    modifier = obj.modifiers.new(name="AgentSam Bevel", type="BEVEL")
    modifier.width = _number(op.get("width", 0.1), "width", minimum=0)
    modifier.segments = _integer(op.get("segments", 2), "segments", minimum=1, maximum=64)
    if hasattr(modifier, "limit_method"):
        method = str(op.get("limit_method", "ANGLE")).upper()
        if method not in {"NONE", "ANGLE", "WEIGHT", "VGROUP"}:
            raise ValueError("bevel limit_method must be NONE, ANGLE, WEIGHT, or VGROUP")
        modifier.limit_method = method
    if op.get("apply", True):
        _apply_modifier(obj, modifier)


def _op_solidify(op: dict[str, Any]) -> None:
    obj = _object(op.get("object"))
    modifier = obj.modifiers.new(name="AgentSam Solidify", type="SOLIDIFY")
    modifier.thickness = _number(op.get("thickness", 0.1), "thickness")
    modifier.offset = _number(op.get("offset", 0), "offset", minimum=-1, maximum=1)
    if op.get("apply", True):
        _apply_modifier(obj, modifier)


def _op_array(op: dict[str, Any]) -> None:
    obj = _object(op.get("object"))
    modifier = obj.modifiers.new(name="AgentSam Array", type="ARRAY")
    modifier.count = _integer(op.get("count", 2), "count", minimum=1, maximum=10000)
    modifier.use_relative_offset = True
    modifier.relative_offset_displace = _vec(op.get("relative_offset"), "relative_offset", default=[1, 0, 0])
    if op.get("apply", True):
        _apply_modifier(obj, modifier)


def _op_mirror(op: dict[str, Any]) -> None:
    obj = _object(op.get("object"))
    axes = str(op.get("axes", "X")).upper()
    if not axes or any(axis not in "XYZ" for axis in axes):
        raise ValueError("mirror axes must contain only X, Y, Z")
    modifier = obj.modifiers.new(name="AgentSam Mirror", type="MIRROR")
    modifier.use_axis = tuple(axis in axes for axis in "XYZ")
    if op.get("apply", True):
        _apply_modifier(obj, modifier)


def _op_boolean(op: dict[str, Any]) -> None:
    target = _object(op.get("object"))
    operand = _object(op.get("with"))
    if target == operand:
        raise ValueError("boolean target and operand must differ")
    operation = str(op.get("operation", "DIFFERENCE")).upper()
    if operation not in BOOLEAN_OPERATIONS:
        raise ValueError("boolean operation must be UNION, DIFFERENCE, or INTERSECT")
    modifier = target.modifiers.new(name="AgentSam Boolean", type="BOOLEAN")
    modifier.operation = operation
    modifier.object = operand
    if hasattr(modifier, "solver"):
        modifier.solver = "EXACT"
    if op.get("apply", True):
        _apply_modifier(target, modifier)
    if op.get("delete_operand", False):
        bpy.data.objects.remove(operand, do_unlink=True)


def _op_material(op: dict[str, Any]) -> None:
    name = _name(op.get("name"), "material name")
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    if "base_color" in op:
        material.diffuse_color = _vec(op["base_color"], "base_color", size=4)
    if "metallic" in op:
        material.metallic = _number(op["metallic"], "metallic", minimum=0, maximum=1)
    if "roughness" in op:
        material.roughness = _number(op["roughness"], "roughness", minimum=0, maximum=1)


def _op_assign_material(op: dict[str, Any]) -> None:
    obj = _object(op.get("object"))
    name = _name(op.get("material"), "material")
    material = bpy.data.materials.get(name)
    if material is None:
        raise ValueError(f"material not found: {name}")
    if not hasattr(obj.data, "materials"):
        raise ValueError(f"object does not support materials: {obj.name}")
    if op.get("clear", False):
        obj.data.materials.clear()
    if material.name not in [item.name for item in obj.data.materials if item]:
        obj.data.materials.append(material)


def _op_add_camera(op: dict[str, Any]) -> None:
    bpy.ops.object.camera_add(
        location=_vec(op.get("location"), "location", default=[0, -10, 5]),
        rotation=_vec(op.get("rotation"), "rotation", default=[math.radians(67), 0, 0]),
    )
    camera = bpy.context.active_object
    camera.name = _name(op.get("name") or "Camera")
    camera.data.lens = _number(op.get("lens", 50), "lens", minimum=1, maximum=1000)
    if op.get("active", True):
        bpy.context.scene.camera = camera


def _op_add_light(op: dict[str, Any]) -> None:
    kind = str(op.get("type", "AREA")).upper()
    if kind not in {"POINT", "SUN", "SPOT", "AREA"}:
        raise ValueError("light type must be POINT, SUN, SPOT, or AREA")
    bpy.ops.object.light_add(
        type=kind,
        location=_vec(op.get("location"), "location", default=[4, -4, 6]),
        rotation=_vec(op.get("rotation"), "rotation", default=[0, 0, 0]),
    )
    light = bpy.context.active_object
    light.name = _name(op.get("name") or f"{kind.title()} Light")
    light.data.energy = _number(op.get("energy", 1000), "energy", minimum=0, maximum=1e9)
    if "color" in op:
        light.data.color = _vec(op["color"], "color", size=3)
    if kind == "AREA" and "size" in op:
        light.data.size = _number(op["size"], "size", minimum=1e-9)


def _configure_units(units: Any) -> None:
    if units is None:
        return
    if not isinstance(units, dict):
        raise ValueError("recipe.units must be an object")
    settings = bpy.context.scene.unit_settings
    if "system" in units:
        system = str(units["system"]).upper()
        if system not in {"NONE", "METRIC", "IMPERIAL"}:
            raise ValueError("units.system must be NONE, METRIC, or IMPERIAL")
        settings.system = system
    if "scale_length" in units:
        settings.scale_length = _number(units["scale_length"], "units.scale_length", minimum=1e-12, maximum=1e12)
    if "length_unit" in units:
        value = str(units["length_unit"]).upper()
        valid = {item.identifier for item in settings.bl_rna.properties["length_unit"].enum_items}
        if value not in valid:
            raise ValueError(f"unsupported length_unit: {value}")
        settings.length_unit = value


def _build(request: dict[str, Any]) -> dict[str, Any]:
    recipe = request.get("recipe")
    if not isinstance(recipe, dict) or recipe.get("schema_version") != 1:
        raise ValueError("recipe schema_version must be 1")
    operations = recipe.get("operations")
    if not isinstance(operations, list) or not operations or len(operations) > MAX_OPERATIONS:
        raise ValueError(f"recipe operations must contain 1..{MAX_OPERATIONS} entries")
    output = Path(str(request.get("output") or "")).expanduser().resolve()
    if output.suffix.lower() != ".blend":
        raise ValueError("build output must be a .blend file")

    _configure_units(recipe.get("units"))
    handlers = {
        "clear_scene": _op_clear_scene,
        "transform": lambda op: _set_transform(_object(op.get("object")), op),
        "duplicate": _op_duplicate,
        "delete": _op_delete,
        "join": _op_join,
        "bevel": _op_bevel,
        "solidify": _op_solidify,
        "array": _op_array,
        "mirror": _op_mirror,
        "boolean": _op_boolean,
        "material": _op_material,
        "assign_material": _op_assign_material,
        "add_camera": _op_add_camera,
        "add_light": _op_add_light,
    }
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict):
            raise ValueError(f"operation {index} must be an object")
        op = str(operation.get("op") or "").strip()
        if op == "add":
            _add_primitive(operation)
        elif op in handlers:
            handlers[op](operation)
        else:
            raise ValueError(f"unsupported operation {index}: {op or '<empty>'}")

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    return {
        "ok": True,
        "blender_version": bpy.app.version_string,
        "operations_applied": len(operations),
        "objects": sorted(obj.name for obj in bpy.data.objects),
        "warnings": [],
    }


def _round_vec(values: Any) -> list[float]:
    return [round(float(value), 9) for value in values]


def _inspect() -> dict[str, Any]:
    scene = bpy.context.scene
    objects: list[dict[str, Any]] = []
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        world_bounds = []
        if obj.bound_box:
            world_bounds = [_round_vec(obj.matrix_world @ Vector(corner)) for corner in obj.bound_box]
        objects.append({
            "name": obj.name,
            "type": obj.type,
            "location": _round_vec(obj.location),
            "rotation": _round_vec(obj.rotation_euler),
            "scale": _round_vec(obj.scale),
            "dimensions": _round_vec(obj.dimensions),
            "world_bounds": world_bounds,
            "materials": sorted(slot.material.name for slot in obj.material_slots if slot.material),
            "modifiers": [{"name": modifier.name, "type": modifier.type} for modifier in obj.modifiers],
        })
    return {
        "ok": True,
        "blender_version": bpy.app.version_string,
        "scene": {
            "active": scene.name,
            "scenes": sorted(item.name for item in bpy.data.scenes),
            "collections": sorted(item.name for item in bpy.data.collections),
            "materials": sorted(item.name for item in bpy.data.materials),
            "cameras": sorted(item.name for item in bpy.data.objects if item.type == "CAMERA"),
            "active_camera": scene.camera.name if scene.camera else None,
            "render_engine": scene.render.engine,
            "units": {
                "system": scene.unit_settings.system,
                "scale_length": scene.unit_settings.scale_length,
                "length_unit": scene.unit_settings.length_unit,
            },
            "objects": objects,
        },
        "warnings": [],
    }


def _select_scene(name: Any) -> bpy.types.Scene:
    if not name:
        return bpy.context.scene
    key = _name(name, "scene")
    scene = bpy.data.scenes.get(key)
    if scene is None:
        raise ValueError(f"scene not found: {key}")
    bpy.context.window.scene = scene
    return scene


def _render_preview(request: dict[str, Any]) -> dict[str, Any]:
    scene = _select_scene(request.get("scene"))
    camera_name = request.get("camera")
    if camera_name:
        camera = _object(camera_name)
        if camera.type != "CAMERA":
            raise ValueError(f"object is not a camera: {camera.name}")
        scene.camera = camera
    if scene.camera is None:
        raise ValueError("scene has no active camera; add/select one before render_preview")

    width = _integer(request.get("width", 1024), "width", minimum=64, maximum=4096)
    height = _integer(request.get("height", 1024), "height", minimum=64, maximum=4096)
    engine = request.get("engine")
    if engine:
        engine = str(engine).upper()
        if engine not in RENDER_ENGINES:
            raise ValueError(f"unsupported render engine: {engine}")
        try:
            scene.render.engine = engine
        except TypeError as exc:
            raise ValueError(f"render engine unavailable in this Blender build: {engine}") from exc

    output = Path(str(request.get("output") or "")).expanduser().resolve()
    if output.suffix.lower() != ".png":
        raise ValueError("render output must be a .png file")
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return {
        "ok": True,
        "blender_version": bpy.app.version_string,
        "scene": scene.name,
        "camera": scene.camera.name,
        "warnings": [],
    }


def _selection(request: dict[str, Any]) -> list[str]:
    names = request.get("objects") or []
    if not isinstance(names, list) or len(names) > 256:
        raise ValueError("objects must be an array with at most 256 names")
    selected = {_name(value, "object") for value in names}
    collection_name = request.get("collection")
    if collection_name:
        collection = bpy.data.collections.get(_name(collection_name, "collection"))
        if collection is None:
            raise ValueError(f"collection not found: {collection_name}")
        selected.update(obj.name for obj in collection.all_objects)
    if selected:
        missing = sorted(name for name in selected if bpy.data.objects.get(name) is None)
        if missing:
            raise ValueError("objects not found: " + ", ".join(missing))
        bpy.ops.object.select_all(action="DESELECT")
        for name in sorted(selected):
            bpy.data.objects[name].select_set(True)
        first = bpy.data.objects[sorted(selected)[0]]
        bpy.context.view_layer.objects.active = first
    return sorted(selected)


def _export(request: dict[str, Any]) -> dict[str, Any]:
    _select_scene(request.get("scene"))
    output_format = str(request.get("format") or "").lower().lstrip(".")
    if output_format not in {"glb", "stl", "obj"}:
        raise ValueError("export format must be glb, stl, or obj")
    output = Path(str(request.get("output") or "")).expanduser().resolve()
    if output.suffix.lower() != f".{output_format}":
        raise ValueError(f"export output must end in .{output_format}")
    output.parent.mkdir(parents=True, exist_ok=True)
    selected = _selection(request)
    use_selection = bool(selected)
    apply_modifiers = bool(request.get("apply_modifiers", True))

    if output_format == "glb":
        kwargs = {"filepath": str(output), "export_format": "GLB", "use_selection": use_selection}
        if apply_modifiers:
            kwargs["export_apply"] = True
        try:
            bpy.ops.export_scene.gltf(**kwargs)
        except TypeError:
            kwargs.pop("export_apply", None)
            bpy.ops.export_scene.gltf(**kwargs)
    elif output_format == "stl":
        if hasattr(bpy.ops.wm, "stl_export"):
            bpy.ops.wm.stl_export(filepath=str(output), export_selected_objects=use_selection, apply_modifiers=apply_modifiers)
        elif hasattr(bpy.ops.export_mesh, "stl"):
            bpy.ops.export_mesh.stl(filepath=str(output), use_selection=use_selection, use_mesh_modifiers=apply_modifiers)
        else:
            raise RuntimeError("this Blender build does not provide an STL exporter")
    elif output_format == "obj":
        if hasattr(bpy.ops.wm, "obj_export"):
            bpy.ops.wm.obj_export(filepath=str(output), export_selected_objects=use_selection, apply_modifiers=apply_modifiers)
        elif hasattr(bpy.ops.export_scene, "obj"):
            bpy.ops.export_scene.obj(filepath=str(output), use_selection=use_selection, use_mesh_modifiers=apply_modifiers)
        else:
            raise RuntimeError("this Blender build does not provide an OBJ exporter")

    return {
        "ok": True,
        "blender_version": bpy.app.version_string,
        "selected_objects": selected,
        "warnings": [],
    }


def main() -> int:
    args = _args()
    try:
        request = _load_request(args.request)
        if args.operation == "inspect":
            value = _inspect()
        elif args.operation == "build":
            value = _build(request)
        elif args.operation == "render_preview":
            value = _render_preview(request)
        elif args.operation == "export":
            value = _export(request)
        else:  # pragma: no cover - argparse guards this
            raise ValueError("unsupported operation")
        _result(value)
        return 0
    except Exception as exc:  # Blender must return machine-readable failure evidence
        _result({
            "ok": False,
            "blender_version": bpy.app.version_string,
            "error": str(exc),
            "error_type": type(exc).__name__,
        })
        traceback.print_exc(file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
