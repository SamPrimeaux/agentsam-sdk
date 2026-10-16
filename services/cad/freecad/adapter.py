#!/usr/bin/env python3
"""Fixed FreeCAD-side adapter for AgentSam precision solid boundary modeling.

Executed in the FreeCAD Python environment with OpenCASCADE kernel access.
Accepts bounded JSON requests with allowlisted parametric solid modeling operations.
Never evaluates user-provided Python strings or arbitrary shell expressions.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

# Ensure FreeCAD C++ Python libraries are on path if running via standalone python
for candidate in [
    "/Applications/FreeCAD.app/Contents/Resources/lib",
    "/usr/lib/freecad/lib",
    "/usr/local/lib/freecad/lib",
]:
    if os.path.isdir(candidate) and candidate not in sys.path:
        sys.path.insert(0, candidate)

try:
    import FreeCAD
    import Part
except ImportError as err:
    print(f"AGENTSAM_RESULT={json.dumps({'ok': False, 'error': f'FreeCAD libraries unavailable: {err}'})}", flush=True)
    sys.exit(1)

RESULT_PREFIX = "AGENTSAM_RESULT="


def _result(value: dict[str, Any]) -> None:
    print(RESULT_PREFIX + json.dumps(value, separators=(",", ":"), sort_keys=True), flush=True)


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--operation", required=True, choices=("build", "inspect"))
    parser.add_argument("--request", required=True)
    return parser.parse_args()


def _load_request(path_str: str) -> dict[str, Any]:
    value = json.loads(Path(path_str).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("request schema_version must be 1")
    return value


def _shape_metrics(shape: Any) -> dict[str, Any]:
    bbox = shape.BoundBox
    return {
        "volume": float(shape.Volume),
        "surface_area": float(shape.Area),
        "faces_count": len(shape.Faces),
        "edges_count": len(shape.Edges),
        "vertices_count": len(shape.Vertexes),
        "bounding_box": {
            "x_min": float(bbox.XMin),
            "x_max": float(bbox.XMax),
            "y_min": float(bbox.YMin),
            "y_max": float(bbox.YMax),
            "z_min": float(bbox.ZMin),
            "z_max": float(bbox.ZMax),
        },
    }


def _execute_build(request: dict[str, Any]) -> dict[str, Any]:
    output_path = request.get("output")
    if not output_path:
        raise ValueError("output path is required")
    output_format = str(request.get("format", "step")).lower().lstrip(".")

    operations = request.get("operations", [])
    if not isinstance(operations, list) or len(operations) == 0:
        raise ValueError("operations list cannot be empty")

    shape: Any = None
    shapes_by_name: dict[str, Any] = {}

    for idx, op_data in enumerate(operations):
        if not isinstance(op_data, dict):
            raise ValueError(f"operation {idx} must be an object")
        op = str(op_data.get("op", "")).lower()
        name = op_data.get("name", f"shape_{idx}")

        if op == "box":
            length = float(op_data.get("length", 10.0))
            width = float(op_data.get("width", 10.0))
            height = float(op_data.get("height", 10.0))
            current = Part.makeBox(length, width, height)
        elif op == "cylinder":
            radius = float(op_data.get("radius", 5.0))
            height = float(op_data.get("height", 10.0))
            current = Part.makeCylinder(radius, height)
        elif op == "sphere":
            radius = float(op_data.get("radius", 5.0))
            current = Part.makeSphere(radius)
        elif op == "cone":
            radius1 = float(op_data.get("radius1", 5.0))
            radius2 = float(op_data.get("radius2", 0.0))
            height = float(op_data.get("height", 10.0))
            current = Part.makeCone(radius1, radius2, height)
        elif op == "cut":
            tool_name = op_data.get("tool")
            base_name = op_data.get("base")
            base_shape = shapes_by_name.get(base_name, shape)
            tool_shape = shapes_by_name.get(tool_name)
            if not base_shape or not tool_shape:
                raise ValueError(f"cut operation {idx} requires valid base and tool shapes")
            current = base_shape.cut(tool_shape)
        elif op == "fuse":
            tool_name = op_data.get("tool")
            base_name = op_data.get("base")
            base_shape = shapes_by_name.get(base_name, shape)
            tool_shape = shapes_by_name.get(tool_name)
            if not base_shape or not tool_shape:
                raise ValueError(f"fuse operation {idx} requires valid base and tool shapes")
            current = base_shape.fuse(tool_shape)
        elif op == "common":
            tool_name = op_data.get("tool")
            base_name = op_data.get("base")
            base_shape = shapes_by_name.get(base_name, shape)
            tool_shape = shapes_by_name.get(tool_name)
            if not base_shape or not tool_shape:
                raise ValueError(f"common operation {idx} requires valid base and tool shapes")
            current = base_shape.common(tool_shape)
        else:
            raise ValueError(f"unsupported FreeCAD operation at {idx}: {op}")

        # Optional translation
        translate = op_data.get("translate")
        if isinstance(translate, (list, tuple)) and len(translate) == 3:
            current.translate(FreeCAD.Vector(float(translate[0]), float(translate[1]), float(translate[2])))

        shapes_by_name[name] = current
        shape = current

    if not shape:
        raise ValueError("No shape generated from operations")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    if output_format in ("step", "stp"):
        shape.exportStep(output_path)
    elif output_format == "iges":
        shape.exportIges(output_path)
    elif output_format == "brep":
        shape.exportBrep(output_path)
    elif output_format == "stl":
        shape.exportStl(output_path)
    else:
        raise ValueError(f"Unsupported export format: {output_format}")

    return {
        "ok": True,
        "format": output_format,
        "output": output_path,
        "bytes": os.path.getsize(output_path),
        "metrics": _shape_metrics(shape),
    }


def _execute_inspect(request: dict[str, Any]) -> dict[str, Any]:
    input_path = request.get("input")
    if not input_path or not os.path.isfile(input_path):
        raise ValueError(f"input file not found: {input_path}")

    shape = Part.Shape()
    shape.read(input_path)
    return {
        "ok": True,
        "input": input_path,
        "bytes": os.path.getsize(input_path),
        "metrics": _shape_metrics(shape),
    }


def main() -> None:
    args = _args()
    try:
        req = _load_request(args.request)
        if args.operation == "build":
            result = _execute_build(req)
        elif args.operation == "inspect":
            result = _execute_inspect(req)
        else:
            raise ValueError(f"Unknown operation: {args.operation}")
        _result(result)
    except Exception as err:
        _result({"ok": False, "error": str(err)})
        sys.exit(1)


if __name__ == "__main__":
    main()
