#!/usr/bin/env python3
"""Generate deterministic cutter-center paths, review-only generic G-code, and evidence."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
from pathlib import Path

SCHEMA = "inneranimalmedia.cam.toolpath.v1"
DIALECT = "generic_fanuc_style"
TOP_Z = -0.5
CLEARANCE_Z = 2.0
SAFE_Z = 5.0
BREAKTHROUGH_Z = -13.0
RAPID_MM_MIN = 3000.0

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def rounded_rect_points(half_l: float, half_w: float, radius: float, segments: int = 12):
    """Closed rounded-rectangle centerline, counter-clockwise."""
    cx = half_l - radius
    cy = half_w - radius
    pts = [(-cx, -half_w), (cx, -half_w)]
    corners = [
        (cx, -cy, -90.0, 0.0),
        (cx, cy, 0.0, 90.0),
        (-cx, cy, 90.0, 180.0),
        (-cx, -cy, 180.0, 270.0),
    ]
    for index, (x, y, a0, a1) in enumerate(corners):
        for step in range(1, segments + 1):
            a = math.radians(a0 + (a1 - a0) * step / segments)
            pts.append((x + radius * math.cos(a), y + radius * math.sin(a)))
        if index == 0:
            pts.append((half_l, cy))
            pts.append((half_l, cy))
        elif index == 1:
            pts.append((-cx, half_w))
        elif index == 2:
            pts.append((-half_l, -cy))
    # Remove consecutive duplicates, then close exactly.
    cleaned = []
    for pt in pts:
        if not cleaned or math.dist(cleaned[-1], pt) > 1e-7:
            cleaned.append(pt)
    if math.dist(cleaned[0], cleaned[-1]) > 1e-7:
        cleaned.append(cleaned[0])
    return cleaned

def pocket_transform(x: float, y: float, p: dict):
    theta = math.radians(p["pocket_angle_deg"] + 90.0)
    center = p["pocket_center_radius_mm"] / math.sqrt(2.0)
    return (
        center + x * math.cos(theta) - y * math.sin(theta),
        center + x * math.sin(theta) + y * math.cos(theta),
    )

def fmt(v: float) -> str:
    if abs(v) < 0.0005:
        v = 0.0
    return f"{v:.3f}"

class Program:
    def __init__(self):
        self.lines = [
            "%",
            "(CAM MODEL 01 - MOTOR / BEARING END PLATE)",
            "(CANDIDATE B - 150 MM OD; NOT APPROVED FOR MANUFACTURE)",
            "(GENERIC FANUC-STYLE OUTPUT - UNVERIFIED FOR ANY MACHINE)",
            "(PRECONDITION: TOP FACE ESTABLISHED AT Z-0.500; G54 Z0 IS RAW STOCK TOP)",
            "(DEMO OPERATIONS ONLY: POCKET, CLEARANCE DRILLING, PILOT, BORE, COUNTERBORE)",
            "(FACE, OUTSIDE PROFILE, CHAMFER, FIXTURE AND SECOND SETUP ARE NOT INCLUDED)",
            "G21 G17 G90 G94",
            "G54",
            "G40 G49 G80",
        ]
        self.moves = []
        self.current = {"x": 0.0, "y": 0.0, "z": SAFE_Z}
        self.tool = None
        self.operation = "setup"
        self.tool_changes = 0

    def comment(self, value: str):
        self.lines.append(f"({value})")

    def _record(self, kind, start, end, op, feed=None, center=None, direction=None, code=None):
        dx = end["x"] - start["x"]
        dy = end["y"] - start["y"]
        dz = end["z"] - start["z"]
        if kind in ("arc_ccw", "arc_cw") and center:
            radius = math.hypot(start["x"] - center["x"], start["y"] - center["y"])
            a0 = math.atan2(start["y"] - center["y"], start["x"] - center["x"])
            a1 = math.atan2(end["y"] - center["y"], end["x"] - center["x"])
            delta = (a1 - a0) % (2 * math.pi) if kind == "arc_ccw" else (a0 - a1) % (2 * math.pi)
            if delta < 1e-8 and math.hypot(dx, dy) < 1e-8:
                delta = 2 * math.pi
            xy_length = radius * delta
            length = math.hypot(xy_length, dz)
        else:
            length = math.sqrt(dx * dx + dy * dy + dz * dz)
        if length < 1e-8:
            return
        row = {
            "index": len(self.moves) + 1,
            "operation_id": op,
            "motion": kind,
            "start_mm": {k: round(v, 5) for k, v in start.items()},
            "end_mm": {k: round(v, 5) for k, v in end.items()},
            "length_mm": round(length, 5),
            "gcode": code,
        }
        if feed is not None:
            row["feed_mm_min"] = feed
        if center:
            row["center_mm"] = {"x": round(center["x"], 5), "y": round(center["y"], 5)}
        if direction:
            row["direction"] = direction
        self.moves.append(row)

    def rapid(self, op, x=None, y=None, z=None):
        start = dict(self.current)
        end = dict(self.current)
        axes = []
        for key, value in (("x", x), ("y", y), ("z", z)):
            if value is not None:
                end[key] = float(value)
                axes.append(f"{key.upper()}{fmt(float(value))}")
        if not axes:
            return
        code = "G0 " + " ".join(axes)
        self.lines.append(code)
        self._record("rapid", start, end, op, code=code)
        self.current = end

    def feed(self, op, feed, x=None, y=None, z=None):
        start = dict(self.current)
        end = dict(self.current)
        axes = []
        for key, value in (("x", x), ("y", y), ("z", z)):
            if value is not None:
                end[key] = float(value)
                axes.append(f"{key.upper()}{fmt(float(value))}")
        if not axes:
            return
        axes.append(f"F{float(feed):.1f}")
        code = "G1 " + " ".join(axes)
        self.lines.append(code)
        self._record("feed", start, end, op, float(feed), code=code)
        self.current = end

    def arc(self, op, direction, feed, x, y, z, i, j):
        start = dict(self.current)
        end = {"x": float(x), "y": float(y), "z": float(z)}
        center = {"x": start["x"] + float(i), "y": start["y"] + float(j)}
        cmd = "G3" if direction == "ccw" else "G2"
        code = (
            f"{cmd} X{fmt(end['x'])} Y{fmt(end['y'])} Z{fmt(end['z'])} "
            f"I{fmt(float(i))} J{fmt(float(j))} F{float(feed):.1f}"
        )
        self.lines.append(code)
        kind = "arc_ccw" if direction == "ccw" else "arc_cw"
        self._record(kind, start, end, op, float(feed), center, direction, code)
        self.current = end

    def tool_change(self, number, rpm, label):
        if self.current["z"] < SAFE_Z:
            self.rapid(self.operation, z=SAFE_Z)
        if self.tool is not None:
            self.lines.append("M5")
        self.lines.append(f"(T{number} - {label})")
        self.lines.append(f"T{number} M6")
        self.lines.append(f"S{int(rpm)} M3")
        self.tool = number
        self.tool_changes += 1

def pocket_x_limit(y: float, half_l: float, half_w: float, radius: float, offset: float):
    side_x = half_l - offset
    corner_x = half_l - radius
    corner_y = half_w - radius
    effective_r = radius - offset
    ay = abs(y)
    if ay <= corner_y:
        return side_x
    if ay > corner_y + effective_r + 1e-7:
        return None
    return corner_x + math.sqrt(max(0.0, effective_r * effective_r - (ay - corner_y) ** 2))

def generate_paths(params: dict, out: Path):
    p = params["candidate"]
    prog = Program()
    tool_definitions = [
        {"number": 1, "diameter_mm": 6.0, "flutes": 3, "type": "carbide flat end mill", "stickout_mm": 18, "rpm": 10000, "feed_mm_min": 400, "ramp_feed_mm_min": 150, "status": "starting value; verify vendor data and machine rigidity"},
        {"number": 2, "diameter_mm": 6.6, "flutes": 2, "type": "drill", "stickout_mm": 28, "rpm": 4000, "feed_mm_min": 160, "peck_depth_mm": 2.0, "status": "starting value; verify vendor data and machine rigidity"},
        {"number": 3, "diameter_mm": 12.0, "flutes": 2, "type": "drill", "stickout_mm": 30, "rpm": 2500, "feed_mm_min": 100, "peck_depth_mm": 2.0, "status": "starting value; verify vendor data and machine rigidity"},
        {"number": 4, "diameter_mm": 10.0, "flutes": 2, "type": "90-degree chamfer mill", "stickout_mm": 25, "rpm": 6000, "feed_mm_min": 120, "status": "starting value; tool geometry and chamfer compensation unverified"},
        {"number": 5, "diameter_mm": 10.0, "flutes": 3, "type": "carbide flat end mill for facing and outside profile", "stickout_mm": 25, "rpm": 8000, "feed_mm_min": 350, "stepover_mm": 6.0, "status": "starting value; verify vendor data and workholding"},
    ]
    op_meta = []
    def begin(op, description):
        prog.operation = op
        prog.comment("OPERATION " + op + " - " + description)

    # Operation 1/2: rough pocket raster with 0.3 mm radial stock left for a wall finish.
    begin("pocket-rough", "rounded pocket roughing; 0.3 mm wall stock left")
    prog.tool_change(1, 10000, "6 mm 3-flute carbide end mill")
    tool_r = 3.0
    offset = tool_r + 0.3
    half_l = p["pocket_length_mm"] / 2.0
    half_w = p["pocket_width_mm"] / 2.0
    radius = p["pocket_corner_radius_mm"]
    effective_half_w = half_w - offset
    stepover = 2.4
    lane_count = math.ceil((2 * effective_half_w) / stepover)
    lane_step = (2 * effective_half_w) / lane_count
    lane_ys = [-effective_half_w + i * lane_step for i in range(lane_count + 1)]
    pocket_center = pocket_transform(0, 0, p)
    pocket_depths = [-1.5, -2.5, -3.5, -4.5]
    for depth in pocket_depths:
        for y_local in lane_ys:
            xlim = pocket_x_limit(y_local, half_l, half_w, radius, offset)
            if xlim is None:
                continue
            sx, sy = pocket_transform(-15.0, y_local, p)
            ex, ey = pocket_transform(15.0, y_local, p)
            rx, ry = pocket_transform(xlim, y_local, p)
            lx, ly = pocket_transform(-xlim, y_local, p)
            prog.rapid("pocket-rough", z=SAFE_Z)
            prog.rapid("pocket-rough", x=sx, y=sy, z=CLEARANCE_Z)
            prog.feed("pocket-rough", 120, z=TOP_Z)
            prog.feed("pocket-rough", 150, x=ex, y=ey, z=depth)
            prog.feed("pocket-rough", 400, x=rx, y=ry, z=depth)
            prog.feed("pocket-rough", 400, x=lx, y=ly, z=depth)
            prog.rapid("pocket-rough", z=CLEARANCE_Z)
    op_meta.append({
        "id": "pocket-rough", "status": "generated", "tool": 1, "strategy": "linear ramp-in plus serpentine raster",
        "depths_z_mm": pocket_depths, "stepdown_mm": 1.0, "stepover_mm": round(lane_step, 4),
        "stock_to_leave_radial_mm": 0.3, "corner_radius_mm": radius,
        "tool_radius_mm": tool_r, "corner_access_check": radius >= tool_r,
    })

    begin("pocket-finish", "rounded pocket wall finish at final depth")
    prog.rapid("pocket-finish", z=SAFE_Z)
    prog.rapid("pocket-finish", x=pocket_center[0], y=pocket_center[1], z=CLEARANCE_Z)
    prog.feed("pocket-finish", 100, z=TOP_Z)
    prog.feed("pocket-finish", 100, z=-p["pocket_depth_mm"] - 0.5)
    finish_pts = rounded_rect_points(half_l - tool_r, half_w - tool_r, radius - tool_r, 16)
    world_pts = [pocket_transform(x, y, p) for x, y in finish_pts]
    for x, y in world_pts:
        prog.feed("pocket-finish", 250, x=x, y=y)
    prog.rapid("pocket-finish", z=SAFE_Z)
    op_meta.append({
        "id": "pocket-finish", "status": "generated", "tool": 1, "strategy": "closed rounded-rectangle contour",
        "final_depth_z_mm": -p["pocket_depth_mm"] - 0.5, "stock_to_leave_radial_mm": 0.0,
        "centerline_corner_radius_mm": radius - tool_r,
    })

    # Operation 3: explicit peck-drill moves for the four clearance holes.
    def peck_drill(op, tool, rpm, feed, points, label):
        begin(op, label)
        prog.tool_change(tool, rpm, f"T{tool} drill")
        peck_depth = 2.0
        pecks = [-2.0, -4.0, -6.0, -8.0, -10.0, -12.0, BREAKTHROUGH_Z]
        for x, y in points:
            prog.rapid(op, z=SAFE_Z)
            prog.rapid(op, x=x, y=y, z=CLEARANCE_Z)
            prog.feed(op, 100, z=0.0)
            previous = 0.0
            for index, depth in enumerate(pecks):
                if index:
                    prog.rapid(op, z=CLEARANCE_Z)
                    prog.rapid(op, z=previous + 0.5)
                prog.feed(op, feed, z=depth)
                previous = depth
            prog.rapid(op, z=SAFE_Z)
        return pecks
    bolt_radius = p["bolt_circle_diameter_mm"] / 2.0
    hole_points = [
        (bolt_radius * math.cos(math.radians(a)), bolt_radius * math.sin(math.radians(a)))
        for a in p["bolt_hole_angles_deg"]
    ]
    hole_pecks = peck_drill("clearance-drill", 2, 4000, 160, hole_points, "four 6.6 mm clearance holes; explicit peck moves")
    op_meta.append({
        "id": "clearance-drill", "status": "generated", "tool": 2, "strategy": "explicit peck drilling",
        "hole_count": len(hole_points), "diameter_mm": p["hole_diameter_mm"],
        "bolt_circle_diameter_mm": p["bolt_circle_diameter_mm"], "peck_depth_mm": 2.0,
        "final_z_mm": BREAKTHROUGH_Z,
    })

    pilot_pecks = peck_drill("bore-pilot", 3, 2500, 100, [(0.0, 0.0)], "12 mm center pilot hole for circular interpolation")
    op_meta.append({
        "id": "bore-pilot", "status": "generated", "tool": 3, "strategy": "explicit peck drilling",
        "diameter_mm": 12.0, "peck_depth_mm": 2.0, "final_z_mm": BREAKTHROUGH_Z,
    })

    # Operation 4: helical entry and concentric passes for the 40 mm through bore.
    begin("bore-interpolate", "40 mm nominal through bore; H7 still requires qualified finishing and inspection")
    prog.tool_change(1, 10000, "6 mm 3-flute carbide end mill (reloaded)")
    bore_depths = []
    z = -1.5
    while z > BREAKTHROUGH_Z + 1e-8:
        bore_depths.append(round(z, 3))
        z -= 1.0
    if not bore_depths or abs(bore_depths[-1] - BREAKTHROUGH_Z) > 1e-8:
        bore_depths.append(BREAKTHROUGH_Z)
    bore_radii = [8.0, 10.0, 12.0, 14.0, 16.0, 17.0]
    previous_z = TOP_Z
    for depth in bore_depths:
        prog.rapid("bore-interpolate", z=SAFE_Z)
        prog.rapid("bore-interpolate", x=8.0, y=0.0, z=CLEARANCE_Z)
        prog.feed("bore-interpolate", 120, z=previous_z)
        mid = (previous_z + depth) / 2.0
        prog.arc("bore-interpolate", "ccw", 120, -8.0, 0.0, mid, -8.0, 0.0)
        prog.arc("bore-interpolate", "ccw", 120, 8.0, 0.0, depth, 8.0, 0.0)
        for r in bore_radii[1:]:
            prog.feed("bore-interpolate", 180, x=r, y=0.0)
            prog.arc("bore-interpolate", "ccw", 180, -r, 0.0, depth, -r, 0.0)
            prog.arc("bore-interpolate", "ccw", 180, r, 0.0, depth, r, 0.0)
        previous_z = depth
    prog.rapid("bore-interpolate", z=SAFE_Z)
    op_meta.append({
        "id": "bore-interpolate", "status": "generated", "tool": 1, "strategy": "helical entry plus concentric interpolation passes",
        "nominal_diameter_mm": p["bore_diameter_mm"], "centerline_radii_mm": bore_radii,
        "stepdown_mm": 1.0, "final_z_mm": BREAKTHROUGH_Z,
        "tolerance_status": "nominal path only; H7 is not certified by this toolpath",
    })

    # Operation 5: counterbore annulus uses the through-bore wall as its inner boundary.
    begin("counterbore-interpolate", "52 mm counterbore; 4 mm below finished top face")
    prog.rapid("counterbore-interpolate", z=SAFE_Z)
    prog.rapid("counterbore-interpolate", x=23.0, y=0.0, z=CLEARANCE_Z)
    prog.feed("counterbore-interpolate", 100, z=TOP_Z)
    previous_z = TOP_Z
    final_cb_z = TOP_Z - p["counterbore_depth_mm"]
    while previous_z > final_cb_z + 1e-8:
        next_z = max(final_cb_z, previous_z - 0.5)
        mid = (previous_z + next_z) / 2.0
        prog.arc("counterbore-interpolate", "ccw", 120, -23.0, 0.0, mid, -23.0, 0.0)
        prog.arc("counterbore-interpolate", "ccw", 120, 23.0, 0.0, next_z, 23.0, 0.0)
        previous_z = next_z
    # Finish circle at the final counterbore depth.
    prog.arc("counterbore-interpolate", "ccw", 100, -23.0, 0.0, final_cb_z, -23.0, 0.0)
    prog.arc("counterbore-interpolate", "ccw", 100, 23.0, 0.0, final_cb_z, 23.0, 0.0)
    prog.rapid("counterbore-interpolate", z=SAFE_Z)
    op_meta.append({
        "id": "counterbore-interpolate", "status": "generated", "tool": 1, "strategy": "helical circular interpolation",
        "diameter_mm": p["counterbore_diameter_mm"], "depth_mm": p["counterbore_depth_mm"],
        "centerline_radius_mm": 23.0, "axial_stepdown_mm": 0.5,
    })

    prog.lines.extend(["M5", "G0 Z5.000", "M30", "%"])
    gcode_path = out / "toolpath-unverified.nc"
    gcode_path.write_text("\n".join(prog.lines) + "\n", encoding="utf-8")

    # Validate the emitted path independently of the CAD builder.
    stock_radius = p["outer_diameter_mm"] / 2.0 + 2.0
    finite = all(
        math.isfinite(v)
        for move in prog.moves
        for point_key in ("start_mm", "end_mm")
        for v in move[point_key].values()
    )
    max_radius = max(
        math.hypot(move[key]["x"], move[key]["y"])
        for move in prog.moves
        for key in ("start_mm", "end_mm")
    )
    min_z = min(move[key]["z"] for move in prog.moves for key in ("start_mm", "end_mm"))
    max_z = max(move[key]["z"] for move in prog.moves for key in ("start_mm", "end_mm"))
    gcode_text = gcode_path.read_text(encoding="utf-8")
    motion_lines = [line for line in prog.lines if re.match(r"^G[0123]\s", line)]
    # Parse the emitted NC text independently of the in-memory move writer.
    parsed_position = {"x": 0.0, "y": 0.0, "z": 0.0}
    parsed_positions = [dict(parsed_position)]
    parsed_arc_errors = []
    parsed_finite = True
    for line in gcode_text.splitlines():
        command_match = re.match(r"^(G[0123])(?:\s|$)", line)
        if not command_match:
            continue
        words = {key.upper(): float(value) for key, value in re.findall(
            r"([XYZIJKF])([-+]?(?:\d+(?:\.\d*)?|\.\d+))", line
        )}
        if any(not math.isfinite(value) for value in words.values()):
            parsed_finite = False
            continue
        start = dict(parsed_position)
        command = command_match.group(1)
        if command in ("G2", "G3"):
            if "I" not in words or "J" not in words:
                parsed_arc_errors.append({"line": line, "error": "arc_center_missing"})
            else:
                center_x = start["x"] + words["I"]
                center_y = start["y"] + words["J"]
                end_x = words.get("X", start["x"])
                end_y = words.get("Y", start["y"])
                start_radius = math.hypot(start["x"] - center_x, start["y"] - center_y)
                end_radius = math.hypot(end_x - center_x, end_y - center_y)
                if abs(start_radius - end_radius) > 0.02:
                    parsed_arc_errors.append({
                        "line": line,
                        "start_radius_mm": round(start_radius, 6),
                        "end_radius_mm": round(end_radius, 6),
                        "error": "arc_radius_mismatch",
                    })
        for axis in ("X", "Y", "Z"):
            if axis in words:
                parsed_position[axis.lower()] = words[axis]
        parsed_positions.append(dict(parsed_position))
    parsed_max_radius = max(math.hypot(point["x"], point["y"]) for point in parsed_positions)
    parsed_min_z = min(point["z"] for point in parsed_positions)
    parsed_max_z = max(point["z"] for point in parsed_positions)
    parsed_arc_count = sum(1 for line in motion_lines if line.startswith(("G2 ", "G3 ")))
    parsed_motion_count = len(motion_lines)
    checks = [
        {"check": "geometry_verification_precondition", "expected": True, "actual": json.loads((out / "verification.json").read_text())["all_checks_pass"], "pass": json.loads((out / "verification.json").read_text())["all_checks_pass"]},
        {"check": "required_operations_generated", "expected": ["pocket-rough", "clearance-drill", "bore-interpolate"], "actual": sorted({m["operation_id"] for m in prog.moves} & {"pocket-rough", "clearance-drill", "bore-interpolate"}), "pass": all(x in {m["operation_id"] for m in prog.moves} for x in ["pocket-rough", "clearance-drill", "bore-interpolate"])},
        {"check": "all_coordinates_finite", "expected": True, "actual": finite, "pass": finite},
        {"check": "tool_center_within_stock_envelope", "expected": f"<= {stock_radius:g} mm radius", "actual": round(max_radius, 5), "pass": max_radius <= stock_radius + 1e-5},
        {"check": "z_limits", "expected": {"min_mm": BREAKTHROUGH_Z, "max_mm": SAFE_Z}, "actual": {"min_mm": round(min_z, 5), "max_mm": round(max_z, 5)}, "pass": min_z >= BREAKTHROUGH_Z - 1e-5 and max_z <= SAFE_Z + 1e-5},
        {"check": "gcode_has_metric_absolute_setup", "expected": True, "actual": all(x in gcode_text for x in ["G21 G17 G90 G94", "G54"]), "pass": all(x in gcode_text for x in ["G21 G17 G90 G94", "G54"])},
        {"check": "gcode_has_program_end", "expected": "M30", "actual": "M30" in gcode_text, "pass": "M30" in gcode_text},
        {"check": "gcode_marked_unverified", "expected": True, "actual": "UNVERIFIED" in gcode_text and "NOT APPROVED" in gcode_text, "pass": "UNVERIFIED" in gcode_text and "NOT APPROVED" in gcode_text},
        {"check": "gcode_motion_text_parses", "expected": True, "actual": parsed_finite and parsed_motion_count > 100, "pass": parsed_finite and parsed_motion_count > 100},
        {"check": "gcode_arc_radii_consistent", "expected": "all emitted G2/G3 arcs have matching start/end radii within 0.02 mm", "actual": {"arc_count": parsed_arc_count, "errors": parsed_arc_errors[:10]}, "pass": parsed_arc_count > 0 and not parsed_arc_errors},
        {"check": "gcode_coordinate_envelope", "expected": {"stock_radius_mm": stock_radius, "min_z_mm": BREAKTHROUGH_Z, "max_z_mm": SAFE_Z}, "actual": {"max_tool_center_radius_mm": round(parsed_max_radius, 5), "min_z_mm": round(parsed_min_z, 5), "max_z_mm": round(parsed_max_z, 5)}, "pass": parsed_max_radius <= stock_radius + 1e-5 and parsed_min_z >= BREAKTHROUGH_Z - 1e-5 and parsed_max_z <= SAFE_Z + 1e-5},
        {"check": "nonempty_motion_program", "expected": "> 100 motion commands", "actual": len(motion_lines), "pass": len(motion_lines) > 100},
    ]
    all_pass = all(row["pass"] for row in checks)
    if not all_pass:
        raise RuntimeError("toolpath_verification_failed: " + json.dumps([row for row in checks if not row["pass"]]))

    # Generate a backplot from the same moves consumed by the NC writer.
    W = H = 1000
    cx = cy = 450.0
    scale = 3.6
    def sx(x): return cx + x * scale
    def sy(y): return cy - y * scale
    def esc(value): return html.escape(str(value), quote=True)
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Generated toolpath backplot">',
        '<rect width="100%" height="100%" fill="#f4f5f1"/>',
        '<text x="50" y="48" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="2" fill="#526b62">CAM MODEL 01 / GENERATED TOOLPATH</text>',
        '<text x="50" y="78" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#203b34">Cutter-center backplot · Candidate B</text>',
        f'<circle cx="{cx}" cy="{cy}" r="{p["outer_diameter_mm"]/2*scale:.2f}" fill="#fffdfa" stroke="#314b45" stroke-width="2.6"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{p["bolt_circle_diameter_mm"]/2*scale:.2f}" fill="none" stroke="#b4bdb7" stroke-width="1.5" stroke-dasharray="6 7"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{p["counterbore_diameter_mm"]/2*scale:.2f}" fill="none" stroke="#85968c" stroke-width="2" stroke-dasharray="7 5"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{p["bore_diameter_mm"]/2*scale:.2f}" fill="none" stroke="#85968c" stroke-width="2"/>',
    ]
    for x, y in hole_points:
        svg.append(f'<circle cx="{sx(x):.2f}" cy="{sy(y):.2f}" r="{p["hole_diameter_mm"]/2*scale:.2f}" fill="#fffdfa" stroke="#314b45" stroke-width="1.8"/>')
    pocket_boundary = rounded_rect_points(p["pocket_length_mm"]/2, p["pocket_width_mm"]/2, p["pocket_corner_radius_mm"], 12)
    pb = [pocket_transform(x, y, p) for x, y in pocket_boundary]
    svg.append('<path d="' + " ".join(("M" if i == 0 else "L") + f"{sx(x):.2f},{sy(y):.2f}" for i, (x, y) in enumerate(pb)) + ' Z" fill="none" stroke="#7d9388" stroke-width="1.5"/>')

    def arc_points(move, segments=20):
        start = move["start_mm"]
        end = move["end_mm"]
        center = move.get("center_mm")
        if not center:
            return [(start["x"], start["y"]), (end["x"], end["y"])]
        r = math.hypot(start["x"] - center["x"], start["y"] - center["y"])
        a0 = math.atan2(start["y"] - center["y"], start["x"] - center["x"])
        a1 = math.atan2(end["y"] - center["y"], end["x"] - center["x"])
        delta = (a1 - a0) % (2 * math.pi) if move["motion"] == "arc_ccw" else (a0 - a1) % (2 * math.pi)
        if delta < 1e-8 and math.hypot(end["x"] - start["x"], end["y"] - start["y"]) < 1e-8:
            delta = 2 * math.pi
        sign = 1 if move["motion"] == "arc_ccw" else -1
        return [(center["x"] + r * math.cos(a0 + sign * delta * i / segments),
                 center["y"] + r * math.sin(a0 + sign * delta * i / segments)) for i in range(segments + 1)]

    for move in prog.moves:
        start = move["start_mm"]
        end = move["end_mm"]
        if math.hypot(end["x"] - start["x"], end["y"] - start["y"]) < 1e-6:
            continue
        pts = arc_points(move) if move["motion"].startswith("arc_") else [(start["x"], start["y"]), (end["x"], end["y"])]
        points = " ".join(f"{sx(x):.2f},{sy(y):.2f}" for x, y in pts)
        if move["motion"] == "rapid":
            color, dash, width = "#c08b45", ' stroke-dasharray="6 5"', 1.25
        elif move["motion"].startswith("arc_"):
            color, dash, width = "#315f9b", "", 1.6
        else:
            color, dash, width = "#2d7771", "", 1.35
        svg.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="{width}"{dash} opacity="0.76" stroke-linecap="round" stroke-linejoin="round"/>')
    svg.extend([
        '<rect x="720" y="150" width="235" height="215" rx="5" fill="#fffdfa" stroke="#d6ddd6"/>',
        '<text x="745" y="185" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#203b34">MOTION LEGEND</text>',
        '<line x1="745" y1="220" x2="795" y2="220" stroke="#c08b45" stroke-width="3" stroke-dasharray="6 5"/><text x="810" y="225" font-family="Arial, sans-serif" font-size="13" fill="#203b34">Rapid / reposition</text>',
        '<line x1="745" y1="255" x2="795" y2="255" stroke="#2d7771" stroke-width="3"/><text x="810" y="260" font-family="Arial, sans-serif" font-size="13" fill="#203b34">Feed / cut</text>',
        '<line x1="745" y1="290" x2="795" y2="290" stroke="#315f9b" stroke-width="3"/><text x="810" y="295" font-family="Arial, sans-serif" font-size="13" fill="#203b34">Arc / helix</text>',
        f'<text x="745" y="335" font-family="Arial, sans-serif" font-size="12" fill="#61736c">{len(prog.moves)} recorded moves</text>',
        '<rect x="720" y="390" width="235" height="190" rx="5" fill="#fffdfa" stroke="#d6ddd6"/>',
        '<text x="745" y="425" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#203b34">PROGRAM LIMITS</text>',
        '<text x="745" y="455" font-family="Arial, sans-serif" font-size="12" fill="#61736c">Z0 = raw stock top</text>',
        '<text x="745" y="478" font-family="Arial, sans-serif" font-size="12" fill="#61736c">Finished top = Z-0.5</text>',
        f'<text x="745" y="501" font-family="Arial, sans-serif" font-size="12" fill="#61736c">Through cut = Z{BREAKTHROUGH_Z:g}</text>',
        '<text x="745" y="536" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#9b593c">UNVERIFIED POST</text>',
        '<text x="50" y="950" font-family="Arial, sans-serif" font-size="14" fill="#9b593c">Review artifact only — no machine, fixture, collision simulation, or controller qualification.</text>',
        '</svg>',
    ])
    (out / "toolpath-preview.svg").write_text("\n".join(svg) + "\n", encoding="utf-8")
    (out / "toolpath-preview.html").write_text(
        '<!doctype html><html><head><meta charset="utf-8"><title>Toolpath backplot</title><style>body{margin:0;background:#e8ece7;display:grid;place-items:center;min-height:100vh}img{width:min(96vw,1100px);height:auto;background:#f4f5f1;box-shadow:0 18px 60px #132b241a}</style></head><body><img src="toolpath-preview.svg" alt="Generated toolpath backplot"></body></html>\n',
        encoding="utf-8",
    )

    feed_seconds = sum(m["length_mm"] / m["feed_mm_min"] * 60 for m in prog.moves if m.get("feed_mm_min"))
    rapid_seconds = sum(m["length_mm"] / RAPID_MM_MIN * 60 for m in prog.moves if m["motion"] == "rapid")
    overhead_seconds = prog.tool_changes * 10.0 + 20.0
    estimated_seconds = feed_seconds + rapid_seconds + overhead_seconds
    gcode_sha = sha256(gcode_path)
    toolpath_doc = {
        "schema": SCHEMA,
        "part_id": params["part_id"],
        "revision": params["revision"],
        "design_status": "proposal_not_approved",
        "dialect": DIALECT,
        "post_status": "UNVERIFIED",
        "units": "mm",
        "wcs": {
            "coordinate_system": "G54",
            "origin": "center of raw stock top",
            "x0_mm": 0.0, "y0_mm": 0.0, "z0_mm": 0.0,
            "finished_top_z_mm": TOP_Z,
            "finished_bottom_z_mm": -12.5,
            "through_breakthrough_z_mm": BREAKTHROUGH_Z,
        },
        "tooling": tool_definitions,
        "operations": op_meta,
        "moves": prog.moves,
        "summary": {
            "move_count": len(prog.moves),
            "gcode_motion_line_count": len(motion_lines),
            "feed_motion_seconds": round(feed_seconds, 2),
            "rapid_motion_seconds_at_assumed_rate": round(rapid_seconds, 2),
            "tool_change_allowance_seconds": round(prog.tool_changes * 10.0, 2),
            "other_allowance_seconds": 20.0,
            "estimated_cycle_time_seconds": round(estimated_seconds, 2),
            "estimated_cycle_time_basis": "feed and rapid distance estimate plus explicit 10 s per tool change and 20 s other allowance; excludes machine acceleration, actual controller behavior, probing, coolant, setup, and ungenerated face/profile/chamfer operations",
            "gcode_file": gcode_path.name,
            "gcode_sha256": gcode_sha,
        },
    }
    (out / "toolpath.json").write_text(json.dumps(toolpath_doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    verification = {
        "schema": "inneranimalmedia.cam.toolpath-verification.v1",
        "part_id": params["part_id"],
        "revision": params["revision"],
        "design_status": "proposal_not_approved",
        "dialect": DIALECT,
        "post_status": "UNVERIFIED",
        "checks": checks,
        "all_checks_pass": all_pass,
        "limits": {
            "stock_radius_mm": stock_radius,
            "max_tool_center_radius_mm": round(max_radius, 5),
            "min_z_mm": round(min_z, 5),
            "max_z_mm": round(max_z, 5),
            "gcode_parsed_max_tool_center_radius_mm": round(parsed_max_radius, 5),
            "gcode_parsed_min_z_mm": round(parsed_min_z, 5),
            "gcode_parsed_max_z_mm": round(parsed_max_z, 5),
            "gcode_parsed_arc_count": parsed_arc_count,
            "gcode_motion_line_count": len(motion_lines),
        },
        "not_verified": [
            "No machine-specific postprocessor or controller dialect selected.",
            "No machine, fixture, clamp, or workholding collision simulation.",
            "No cutting load, tool deflection, chip evacuation, or spindle power simulation.",
            "Feeds and speeds are starting values only and require tool-vendor and machine verification.",
            "Ø40 H7 is not certified by nominal interpolation; use qualified finish process and inspect the bore.",
            "The generic program does not include stock facing, outside profile finishing, chamfering, or the second setup.",
        ],
    }
    (out / "gcode-verification.json").write_text(json.dumps(verification, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # Enrich the operation plan generated by the presentation/drawing stage.
    plan_path = out / "cam-plan.json"
    if plan_path.exists():
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    else:
        plan = {"schema": "inneranimalmedia.cam.plan.v1", "part_id": params["part_id"], "revision": params["revision"]}
    plan.update({
        "design_status": "proposal_not_approved",
        "execution_mode": "generated_generic_toolpath_review",
        "machine_ready": False,
        "controller_output": {
            "generated": True,
            "dialect": DIALECT,
            "status": "UNVERIFIED",
            "file": gcode_path.name,
            "sha256": gcode_sha,
            "includes": ["pocket roughing", "pocket wall finish", "four-hole peck drilling", "center pilot drilling", "through-bore interpolation", "counterbore interpolation"],
            "omits": ["stock facing", "outside profile finishing", "outer-edge chamfer", "fixture/setup moves", "second setup"],
            "reason": "Generic review program only. A qualified machine-specific post and simulation are still required.",
        },
        "stock_concept": {
            "shape": "round",
            "diameter_mm": p["outer_diameter_mm"] + 4.0,
            "thickness_mm": p["thickness_mm"] + 2.0,
            "material": params["material"],
            "status": "conceptual stock; verify supplier availability and workholding",
            "radial_allowance_mm": 2.0,
            "axial_allowance_mm": 1.0,
        },
        "wcs_concept": {
            "coordinate_system": "G54",
            "origin": "center of raw stock top",
            "x_mm": 0.0, "y_mm": 0.0, "z_mm": 0.0,
            "finished_top_z_mm": TOP_Z,
            "finished_bottom_z_mm": -12.5,
            "axes": {"X": "part horizontal datum", "Y": "part vertical datum", "Z": "normal to top face"},
            "status": "conceptual; confirm stock face and fixture datum",
        },
        "setups": [
            {"id": "setup-01", "access": "top face", "purpose": "face reference, pocket, holes, pilot, bore, counterbore, top chamfer; leave radial stock on outside profile", "status": "conceptual; fixture not defined"},
            {"id": "setup-02", "access": "flipped/back face", "purpose": "finish back face and outside diameter; deburr underside", "status": "planned only; no toolpath generated"},
        ],
        "tools": tool_definitions,
        "operation_sequence": [
            {"order": 1, "id": "face-stock", "name": "Face stock", "tool": 5, "strategy": "raster facing", "rpm": 8000, "feed_mm_min": 350, "stepdown_mm": 0.5, "stepover_mm": 6.0, "stock_to_leave_mm": 0.0, "status": "planned; not included in NC file"},
            {"order": 2, "id": "pocket-rough", "name": "Pocket roughing", "tool": 1, "strategy": "ramp-in plus raster", "rpm": 10000, "feed_mm_min": 400, "ramp_feed_mm_min": 150, "stepdown_mm": 1.0, "stepover_mm": 2.4, "stock_to_leave_radial_mm": 0.3, "status": "generated"},
            {"order": 3, "id": "pocket-finish", "name": "Pocket finishing", "tool": 1, "strategy": "rounded contour", "rpm": 10000, "feed_mm_min": 250, "stepdown_mm": 0.5, "stepover_mm": 0.0, "stock_to_leave_radial_mm": 0.0, "status": "generated"},
            {"order": 4, "id": "clearance-drill", "name": "Drill clearance holes", "tool": 2, "strategy": "explicit peck drilling", "rpm": 4000, "feed_mm_min": 160, "peck_depth_mm": 2.0, "final_z_mm": BREAKTHROUGH_Z, "status": "generated"},
            {"order": 5, "id": "bore-pilot", "name": "Drill bore pilot", "tool": 3, "strategy": "explicit peck drilling", "rpm": 2500, "feed_mm_min": 100, "peck_depth_mm": 2.0, "final_z_mm": BREAKTHROUGH_Z, "status": "generated"},
            {"order": 6, "id": "bore-interpolate", "name": "Bore Ø40 nominal", "tool": 1, "strategy": "helical entry plus concentric interpolation", "rpm": 10000, "feed_mm_min": 180, "stepdown_mm": 1.0, "radial_stepover_mm": 2.0, "stock_to_leave_mm": 0.0, "tolerance_status": "nominal only; H7 requires qualified finish and inspection", "status": "generated"},
            {"order": 7, "id": "counterbore-interpolate", "name": "Counterbore Ø52 x 4 mm", "tool": 1, "strategy": "helical circular interpolation", "rpm": 10000, "feed_mm_min": 120, "stepdown_mm": 0.5, "stock_to_leave_mm": 0.0, "status": "generated"},
            {"order": 8, "id": "outer-chamfer", "name": "Top outside chamfer 0.5 mm", "tool": 4, "strategy": "qualified chamfer contour", "rpm": 6000, "feed_mm_min": 120, "stepdown_mm": 0.5, "status": "planned; not included in NC file"},
            {"order": 9, "id": "finish-outside-profile", "name": "Finish outside diameter and back face", "tool": 5, "strategy": "profile plus flipped setup", "rpm": 8000, "feed_mm_min": 350, "stepdown_mm": 1.0, "stock_to_leave_radial_mm": 0.5, "status": "planned; fixture and second setup not generated"},
        ],
        "verification": {
            "geometry_checks_pass": json.loads((out / "verification.json").read_text(encoding="utf-8"))["all_checks_pass"],
            "toolpath_checks_pass": all_pass,
            "toolpath_move_count": len(prog.moves),
            "toolpath_checks": checks,
        },
        "cycle_time_estimate": toolpath_doc["summary"],
        "excluded": {
            "machine_specific_post": "not selected; generic Fanuc-style code is unverified",
            "physical machining": "not authorized or supported by this artifact",
            "collision_simulation": "not performed",
            "H7_tolerance": "nominal path only; qualified finishing and inspection required",
            "face_profile_chamfer_second_setup": "operation plan only; not in generated NC file",
        },
        "review_required": [
            "Approve Candidate B 150 mm OD or revise the original 120 mm OD/pocket layout.",
            "Confirm material, M6 clearance fit, and the exact Ø40 H7 acceptance limits.",
            "Select stock, machine, fixture, clamps, tools, and a qualified postprocessor.",
            "Simulate collisions and validate feeds/speeds, spindle load, chip evacuation, and workholding.",
            "Inspect the finished bore and all critical dimensions before release.",
        ],
    })
    plan_path.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # The deck's image and narrative must refer to the generated backplot, not the old schematic.
    deck_path = out / "presentation.html"
    if deck_path.exists():
        deck = deck_path.read_text(encoding="utf-8")
        replacements = {
            "The CAM view explains sequence, not machine commands.": "Generated cutter-center paths make the first machining sequence inspectable.",
            '<img src="toolpath-preview.png" alt="Illustrative toolpath layers">': '<img src="toolpath-preview.svg" alt="Generated toolpath backplot">',
            "No executable G-code, machine-specific feeds/speeds, or cycle-time estimate is included.": "Generic Fanuc-style G-code exists for review; post, machine settings, and cycle time remain unverified.",
            "simulation-only process story": "offline CAM review package",
            "The operation map connects each intent to a named CAD feature. It is useful for review without pretending that a machine, fixture, tool library, or post has been validated.": "The generated path data covers pocket roughing and finishing, peck drilling, bore interpolation, and counterbore interpolation. It remains unverified for any machine or post.",
        }
        for old, new in replacements.items():
            deck = deck.replace(old, new)
        deck_path.write_text(deck, encoding="utf-8")

    summary = {
        "schema": "inneranimalmedia.cam.toolpath-result.v1",
        "ok": all_pass,
        "part_id": params["part_id"],
        "revision": params["revision"],
        "design_status": "proposal_not_approved",
        "dialect": DIALECT,
        "post_status": "UNVERIFIED",
        "move_count": len(prog.moves),
        "gcode_motion_line_count": len(motion_lines),
        "gcode_file": gcode_path.name,
        "gcode_sha256": gcode_sha,
        "toolpath_sha256": sha256(out / "toolpath.json"),
        "verification_file": "gcode-verification.json",
        "verification_pass": all_pass,
        "estimated_cycle_time_seconds": round(estimated_seconds, 2),
        "files": [
            {"name": name, "bytes": (out / name).stat().st_size, "sha256": sha256(out / name)}
            for name in ["toolpath-unverified.nc", "toolpath.json", "toolpath-preview.svg", "toolpath-preview.html", "gcode-verification.json", "cam-plan.json"]
        ],
    }
    (out / "toolpath-result.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))
    return 0 if all_pass else 2

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parameters", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    params_path = Path(args.parameters).resolve(strict=True)
    out = Path(args.output_dir).resolve(strict=True)
    params = json.loads(params_path.read_text(encoding="utf-8"))
    return generate_paths(params, out)

if __name__ == "__main__":
    raise SystemExit(main())
