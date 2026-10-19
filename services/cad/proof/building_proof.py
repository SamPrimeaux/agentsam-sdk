#!/usr/bin/env python3
"""CAD toolchain acceptance run: one parametric building shell, six independent engines, numbers that must agree.

Runs INSIDE the agentsam-cad container (it needs the real engines):

  docker exec -i agentsam-cad sh -c 'cat > /work/building_proof.py' < services/cad/proof/building_proof.py
  docker exec agentsam-cad python3 /work/building_proof.py all --out /work/proof
  docker cp agentsam-cad:/work/proof ./cad-proof

Stages (each its own interpreter/engine):
  (also: DXF -> ARCH E PDF at 3/16 in = 1 ft, checked for page size, scale and rendered dimensions)
  freecad  Part booleans: shell = outer - inner - openings  -> STEP + OBJ + exact volume
  occt     the native agentsam-occt binary re-opens FreeCAD's STEP (cross-toolchain interchange)
  ifc      ifcopenshell builds IFC4 (walls, voids, windows, door), re-reads it, meshes it, measures volume
  dxf      ezdxf plan in inches (INSUNITS=1), re-read and measured
  blender  imports the model, renders a turntable, exports GLB
  media    gltf-transform optimizes the GLB; ffmpeg encodes the frames; ffprobe + decoder verify the MP4

Every check compares independent measurements to the analytic answer. Nothing here counts "installed" as proof.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

IN = 25.4  # mm per inch
PARAMS = {
    "length": 480.0, "width": 288.0, "height": 120.0, "wall": 6.0,           # inches: 40 ft x 24 ft x 10 ft, 6 in walls
    "openings": [
        {"id": "door-south", "kind": "door", "wall": "south", "x": 60.0, "sill": 0.0, "width": 36.0, "height": 80.0},
        {"id": "window-south", "kind": "window", "wall": "south", "x": 240.0, "sill": 36.0, "width": 48.0, "height": 48.0},
        {"id": "window-north", "kind": "window", "wall": "north", "x": 120.0, "sill": 36.0, "width": 48.0, "height": 48.0},
    ],
    "frames": 24, "fps": 12,
}
SELF = Path(__file__).resolve()


def analytic(p):
    outer = p["length"] * p["width"] * p["height"]
    inner = (p["length"] - 2 * p["wall"]) * (p["width"] - 2 * p["wall"]) * p["height"]
    cut = sum(o["width"] * o["height"] * p["wall"] for o in p["openings"])
    footprint = p["length"] * p["width"] - (p["length"] - 2 * p["wall"]) * (p["width"] - 2 * p["wall"])
    return {"volume_in3": outer - inner - cut, "footprint_in2": footprint}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


# --------------------------------------------------------------------------- stage: freecad
def stage_freecad(out: Path):
    sys.path.append("/usr/lib/freecad/lib")
    import FreeCAD
    import Part

    p = PARAMS
    L, W, H, T = (p[k] * IN for k in ("length", "width", "height", "wall"))
    V = FreeCAD.Vector
    outer = Part.makeBox(L, W, H)
    inner = Part.makeBox(L - 2 * T, W - 2 * T, H)
    inner.translate(V(T, T, 0))
    shell = outer.cut(inner)
    for o in p["openings"]:
        box = Part.makeBox(o["width"] * IN, T + 2 * IN, o["height"] * IN)
        box.translate(V(o["x"] * IN, -IN if o["wall"] == "south" else W - T - IN, o["sill"] * IN))
        shell = shell.cut(box)
    shell.exportStep(str(out / "shell.step"))
    verts, faces = shell.tessellate(0.5)
    with (out / "shell.obj").open("w") as f:
        for v in verts:
            f.write(f"v {v.x / 1000:.6f} {v.y / 1000:.6f} {v.z / 1000:.6f}\n")   # metres for Blender
        for a, b, c in faces:
            f.write(f"f {a + 1} {b + 1} {c + 1}\n")
    result = {"volume_in3": shell.Volume / IN ** 3, "valid": bool(shell.isValid()), "solids": len(shell.Solids),
              "faces": len(shell.Faces), "bbox_mm": [shell.BoundBox.XLength, shell.BoundBox.YLength, shell.BoundBox.ZLength],
              "freecad": ".".join(str(x) for x in FreeCAD.Version()[:3])}
    (out / "freecad.json").write_text(json.dumps(result, indent=2))


# --------------------------------------------------------------------------- stage: ifc + dxf (venv interpreter)
def stage_ifc(out: Path):
    import numpy as np
    import ezdxf
    import ifcopenshell
    import ifcopenshell.api as api
    import ifcopenshell.geom

    p = PARAMS
    L, W, H, T = (p[k] * IN for k in ("length", "width", "height", "wall"))
    f = api.run("project.create_file", version="IFC4")
    project = api.run("root.create_entity", f, ifc_class="IfcProject", name="cad-toolchain-proof")
    api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "MILLIMETERS"})
    model = api.run("context.add_context", f, context_type="Model")
    body = api.run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
    site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Shell")
    storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Level 1")
    api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    api.run("aggregate.assign_object", f, products=[building], relating_object=site)
    api.run("aggregate.assign_object", f, products=[storey], relating_object=building)

    def place(product, x, y, z=0.0, rotate=False):
        m = np.eye(4)
        if rotate:
            m[0, 0], m[0, 1], m[1, 0], m[1, 1] = 0.0, -1.0, 1.0, 0.0
        m[0, 3], m[1, 3], m[2, 3] = x, y, z
        api.run("geometry.edit_object_placement", f, product=product, matrix=m)

    def solid(cls, name, length, height, thickness, x, y, z=0.0, rotate=False):
        e = api.run("root.create_entity", f, ifc_class=cls, name=name)
        rep = api.run("geometry.add_wall_representation", f, context=body, length=length, height=height, thickness=thickness)
        api.run("geometry.assign_representation", f, product=e, representation=rep)
        place(e, x, y, z, rotate)
        return e

    walls = {
        "south": solid("IfcWall", "Wall-S", L, H, T, 0, 0),
        "north": solid("IfcWall", "Wall-N", L, H, T, 0, W - T),
        "west": solid("IfcWall", "Wall-W", W - 2 * T, H, T, T, T, rotate=True),
        "east": solid("IfcWall", "Wall-E", W - 2 * T, H, T, L, T, rotate=True),
    }
    api.run("spatial.assign_container", f, products=list(walls.values()), relating_structure=storey)
    for o in p["openings"]:
        opening = solid("IfcOpeningElement", f"Opening-{o['id']}", o["width"] * IN, o["height"] * IN, T + 2 * IN,
                        o["x"] * IN, -IN if o["wall"] == "south" else W - T - IN, o["sill"] * IN)
        api.run("feature.add_feature", f, feature=opening, element=walls[o["wall"]])
        fill = api.run("root.create_entity", f, ifc_class="IfcDoor" if o["kind"] == "door" else "IfcWindow", name=o["id"])
        api.run("spatial.assign_container", f, products=[fill], relating_structure=storey)
        api.run("feature.add_filling", f, opening=opening, element=fill)
    f.write(str(out / "shell.ifc"))

    g = ifcopenshell.open(str(out / "shell.ifc"))
    settings = ifcopenshell.geom.settings()
    def mesh_volume(geometry):
        v = np.array(list(geometry.verts), dtype=float).reshape(-1, 3)   # project units: millimetres
        t = np.array(list(geometry.faces), dtype=int).reshape(-1, 3)
        return abs(float(np.einsum('ij,ij->i', v[t[:, 0]], np.cross(v[t[:, 1]], v[t[:, 2]])).sum()) / 6.0)

    total_mm3 = 0.0
    for w in g.by_type("IfcWall"):
        shape = ifcopenshell.geom.create_shape(settings, w)   # keep the shape alive: its geometry buffers are borrowed
        total_mm3 += mesh_volume(shape.geometry)
    ifc = {"schema": g.schema, "walls": len(g.by_type("IfcWall")), "openings": len(g.by_type("IfcOpeningElement")),
           "voids": len(g.by_type("IfcRelVoidsElement")), "windows": len(g.by_type("IfcWindow")), "doors": len(g.by_type("IfcDoor")),
           "fills": len(g.by_type("IfcRelFillsElement")), "storeys": len(g.by_type("IfcBuildingStorey")),
           "ifcopenshell": ifcopenshell.version}
    ifc["volume_in3"] = total_mm3 / IN ** 3
    (out / "ifc.json").write_text(json.dumps(ifc, indent=2))

    # DXF plan, inches
    doc = ezdxf.new("R2010", setup=True)
    doc.units = 1
    doc.layers.add("A-WALL", color=7)
    doc.layers.add("A-OPEN", color=3)
    doc.layers.add("A-DIMS", color=2)
    msp = doc.modelspace()
    Li, Wi, Ti = p["length"], p["width"], p["wall"]
    msp.add_lwpolyline([(0, 0), (Li, 0), (Li, Wi), (0, Wi)], close=True, dxfattribs={"layer": "A-WALL"})
    msp.add_lwpolyline([(Ti, Ti), (Li - Ti, Ti), (Li - Ti, Wi - Ti), (Ti, Wi - Ti)], close=True, dxfattribs={"layer": "A-WALL"})
    for o in p["openings"]:
        y0 = 0.0 if o["wall"] == "south" else Wi - Ti
        msp.add_lwpolyline([(o["x"], y0), (o["x"] + o["width"], y0), (o["x"] + o["width"], y0 + Ti), (o["x"], y0 + Ti)], close=True, dxfattribs={"layer": "A-OPEN"})
    msp.add_linear_dim(base=(0, -36), p1=(0, 0), p2=(Li, 0), dimstyle="EZDXF", dxfattribs={"layer": "A-DIMS"}).render()
    msp.add_linear_dim(base=(-36, 0), p1=(0, 0), p2=(0, Wi), angle=90, dimstyle="EZDXF", dxfattribs={"layer": "A-DIMS"}).render()
    doc.saveas(str(out / "plan.dxf"))
    back = ezdxf.readfile(str(out / "plan.dxf"))

    def area(points):
        return abs(sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))) / 2

    walls_poly = [list(e.get_points("xy")) for e in back.modelspace().query('LWPOLYLINE[layer=="A-WALL"]')]
    dxf = {"insunits": back.header["$INSUNITS"], "wall_polylines": len(walls_poly),
           "footprint_in2": area(walls_poly[0]) - area(walls_poly[1]) if len(walls_poly) == 2 else None,
           "opening_polylines": len(back.modelspace().query('LWPOLYLINE[layer=="A-OPEN"]')),
           "dimensions": len(back.modelspace().query("DIMENSION")), "ezdxf": ezdxf.__version__}
    (out / "dxf.json").write_text(json.dumps(dxf, indent=2))

    # ARCH E sheet at 3/16 in = 1 ft (1/64 of inches), rendered from the DXF just written
    pdf = {}
    try:
        import pymupdf
        from ezdxf.addons.drawing import Frontend, RenderContext, layout, config
        from ezdxf.addons.drawing import pymupdf as ezpdf

        def sheet(with_dims):
            d = ezdxf.readfile(str(out / "plan.dxf"))
            if not with_dims:
                d.layers.get("A-DIMS").off()
            backend = ezpdf.PyMuPdfBackend()
            cfg = config.Configuration(background_policy=config.BackgroundPolicy.WHITE,
                                       color_policy=config.ColorPolicy.MONOCHROME_LIGHT_BG)
            Frontend(RenderContext(d), backend, config=cfg).draw_layout(d.modelspace())
            page = layout.Page(48, 36, layout.Units.inch, margins=layout.Margins.all(0.5))
            # DXF model units are inches. The ezdxf renderer uses millimetres for the
            # page-space layout transformation, so convert inches to mm before 1:64.
            return backend.get_pdf_bytes(page, settings=layout.Settings(scale=25.4 / 64, fit_page=False))

        def dark_pixels(doc):
            pix = doc[0].get_pixmap(dpi=72, alpha=False)
            # Read the pixel buffer exactly once: each access to pix.samples copies it.
            samples = pix.samples
            return sum(1 for i in range(0, len(samples), pix.n) if samples[i] < 128)

        full, bare = sheet(True), sheet(False)
        (out / "sheet-A101-proof.pdf").write_bytes(full)
        d_full, d_bare = pymupdf.open(stream=full, filetype="pdf"), pymupdf.open(stream=bare, filetype="pdf")
        page_w = d_bare[0].rect.width
        shapes = [r["rect"] for r in d_bare[0].get_drawings() if r.get("rect") and r["rect"].width < page_w - 5]  # skip the page background
        pdf = {"pages": len(d_full), "page_pt": [round(d_full[0].rect.width), round(d_full[0].rect.height)],
               "plan_in": [round((max(r.x1 for r in shapes) - min(r.x0 for r in shapes)) / 72, 3), round((max(r.y1 for r in shapes) - min(r.y0 for r in shapes)) / 72, 3)] if shapes else None,
               "dark_with_dims": dark_pixels(d_full), "dark_without_dims": dark_pixels(d_bare), "bytes": len(full), "pymupdf": pymupdf.__version__}
    except Exception as error:  # the PDF toolchain is optional on older images; report it, never hide it
        pdf = {"error": f"{type(error).__name__}: {error}"}
    (out / "pdf.json").write_text(json.dumps(pdf, indent=2))


# --------------------------------------------------------------------------- stage: blender
def stage_blender(out: Path):
    import bpy
    from mathutils import Vector

    p = PARAMS
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.obj(filepath=str(out / "shell.obj"), axis_forward="Y", axis_up="Z")
    scene = bpy.context.scene
    center = Vector((p["length"] * IN / 2000, p["width"] * IN / 2000, p["height"] * IN / 2000 / 2))
    radius = math.hypot(p["length"] * IN, p["width"] * IN) / 1000 * 1.25
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 35
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.rotation_euler = (0.9, 0.2, 0.8)
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.55, 0.62, 0.7)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 6
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 480, 270, 100
    scene.render.image_settings.file_format = "PNG"
    frames = out / "frames"
    frames.mkdir(exist_ok=True)
    n = p["frames"]
    for i in range(n):
        a = 2 * math.pi * i / n
        cam.location = center + Vector((radius * math.cos(a), radius * math.sin(a), radius * 0.45))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(frames / f"frame_{i:03d}.png")
        bpy.ops.render.render(write_still=True)
    for obj in [cam, sun]:
        bpy.data.objects.remove(obj)
    bpy.ops.export_scene.gltf(filepath=str(out / "model.glb"), export_format="GLB")
    (out / "blender.json").write_text(json.dumps({"blender": bpy.app.version_string, "frames": n}))


# --------------------------------------------------------------------------- orchestrator
def all_stages(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HOME", "/tmp/home")
    Path(os.environ["HOME"]).mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "QT_QPA_PLATFORM": "offscreen"}
    steps = [
        ("freecad", [sys.executable, str(SELF), "stage", "freecad", str(out)]),
        ("ifc+dxf", ["/opt/agentsam-venv/bin/python", str(SELF), "stage", "ifc", str(out)]),
        ("blender", ["blender", "-b", "--factory-startup", "--python", str(SELF), "--", "stage", "blender", str(out)]),
    ]
    for name, cmd in steps:
        r = run(cmd, env=env)
        print(f"stage {name}: {'ok' if r.returncode == 0 else 'FAILED'}", flush=True)
        if r.returncode != 0:
            print((r.stdout + r.stderr)[-1800:])
            sys.exit(1)

    want = analytic(PARAMS)
    fc = json.loads((out / "freecad.json").read_text())
    ifc = json.loads((out / "ifc.json").read_text())
    dxf = json.loads((out / "dxf.json").read_text())
    checks = []

    def check(cid, passed, expected, actual, tol=None):
        checks.append({"id": cid, "passed": bool(passed), "expected": expected, "actual": actual, **({"tolerance": tol} if tol else {})})

    rel = lambda a, b: abs(a - b) / b
    check("freecad-solid-valid", fc["valid"] and fc["solids"] == 1, "1 valid solid", f"{fc['solids']} solid(s), valid={fc['valid']}")
    check("freecad-volume-matches-analytic", rel(fc["volume_in3"], want["volume_in3"]) < 1e-6, round(want["volume_in3"], 3), round(fc["volume_in3"], 3), "1e-6")

    occt = run(["agentsam-occt", "--inspect", str(out / "shell.step")])
    m = re.search(r"AGENTSAM_RESULT=(\{.*\})", occt.stdout)
    occt_v = json.loads(m.group(1))["volume_mm3"] / IN ** 3 if m else None
    check("native-occt-reopens-freecad-step", occt_v is not None and rel(occt_v, fc["volume_in3"]) < 1e-6, round(fc["volume_in3"], 3), None if occt_v is None else round(occt_v, 3), "1e-6")

    check("ifc-structure", (ifc["schema"], ifc["walls"], ifc["openings"], ifc["voids"], ifc["windows"], ifc["doors"], ifc["fills"], ifc["storeys"]) == ("IFC4", 4, 3, 3, 2, 1, 3, 1),
          "IFC4: 4 walls, 3 openings/voids/fills, 2 windows, 1 door, 1 storey", {k: ifc[k] for k in ("schema", "walls", "openings", "voids", "windows", "doors", "fills", "storeys")})
    check("ifc-meshed-volume-matches-solid", rel(ifc["volume_in3"], fc["volume_in3"]) < 1e-4, round(fc["volume_in3"], 3), round(ifc["volume_in3"], 3), "1e-4")
    check("dxf-inches-and-layers", dxf["insunits"] == 1 and dxf["wall_polylines"] == 2 and dxf["opening_polylines"] == 3 and dxf["dimensions"] == 2,
          "INSUNITS=1, 2 wall + 3 opening polylines, 2 dimensions", {k: dxf[k] for k in ("insunits", "wall_polylines", "opening_polylines", "dimensions")})
    check("dxf-footprint-matches-analytic", dxf["footprint_in2"] is not None and rel(dxf["footprint_in2"], want["footprint_in2"]) < 1e-9, want["footprint_in2"], dxf["footprint_in2"], "1e-9")

    pdf = json.loads((out / "pdf.json").read_text())
    ok_page = bool(pdf.get("page_pt")) and pdf["pages"] == 1 and abs(pdf["page_pt"][0] - 3456) <= 1 and abs(pdf["page_pt"][1] - 2592) <= 1
    check("dxf-renders-to-arch-e-pdf", ok_page, "1 page, 3456 x 2592 pt (ARCH E, 48 x 36 in)", pdf.get("page_pt") or pdf.get("error"))
    plan = pdf.get("plan_in")
    check("pdf-scale-is-3-16-per-foot", bool(plan) and abs(plan[0] - 7.5) <= 0.03 and abs(plan[1] - 4.5) <= 0.03, "40 x 24 ft plan = 7.500 x 4.500 in on paper", plan or pdf.get("error"))
    check("pdf-dimensions-actually-render", bool(plan) and pdf["dark_with_dims"] > pdf["dark_without_dims"], "more ink with the dimension layer on", f"{pdf.get('dark_with_dims')} vs {pdf.get('dark_without_dims')} dark px" if plan else pdf.get("error"))

    frames = sorted((out / "frames").glob("frame_*.png"))
    check("blender-rendered-all-frames", len(frames) == PARAMS["frames"] and all(f.stat().st_size > 2000 for f in frames), PARAMS["frames"], len(frames))

    opt = out / "model.opt.glb"
    g = run(["gltf-transform", "optimize", str(out / "model.glb"), str(opt), "--compress", "meshopt", "--texture-compress", "webp"])
    v = run(["gltf-transform", "validate", str(opt)])
    check("glb-optimized-and-valid", g.returncode == 0 and opt.is_file() and "No errors found" in (v.stdout + v.stderr),
          "optimize ok, validator reports no errors", f"optimize exit {g.returncode}; {(out / 'model.glb').stat().st_size}B -> {opt.stat().st_size if opt.is_file() else 0}B")

    mp4 = out / "turntable.mp4"
    e = run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-framerate", str(PARAMS["fps"]), "-i", str(out / "frames" / "frame_%03d.png"),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", str(mp4)])
    probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(mp4)]).stdout or "{}")
    stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), {})
    decoded = run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(mp4), "-f", "null", "-"]).returncode == 0
    check("mp4-h264-decodes-with-all-frames", e.returncode == 0 and stream.get("codec_name") == "h264" and int(stream.get("nb_frames", 0)) == PARAMS["frames"] and decoded,
          f"h264, {PARAMS['frames']} frames, decodes", f"{stream.get('codec_name')}, {stream.get('nb_frames')} frames, decoded={decoded}")

    versions = {"freecad": fc["freecad"], "ifcopenshell": ifc["ifcopenshell"], "ezdxf": dxf["ezdxf"], "blender": json.loads((out / "blender.json").read_text())["blender"],
                "ffmpeg": run(["ffmpeg", "-version"]).stdout.splitlines()[0][:48], "gltf-transform": run(["gltf-transform", "--version"]).stdout.strip().splitlines()[-1],
                "agentsam-occt": json.loads(re.search(r"AGENTSAM_RESULT=(\{.*\})", run(["agentsam-occt", "--doctor"]).stdout).group(1))["version"]}
    artifacts = [{"path": str(a.relative_to(out)), "bytes": a.stat().st_size, "sha256": sha256(a)} for a in
                 [out / n for n in ("shell.step", "shell.ifc", "plan.dxf", "sheet-A101-proof.pdf", "model.glb", "model.opt.glb", "turntable.mp4")] if a.is_file()]
    receipt = {"schema": "agentsam.cad.toolchain-proof.v1", "status": "passed" if all(c["passed"] for c in checks) else "failed",
               "parameters": PARAMS, "analytic": want, "versions": versions, "checks": checks, "artifacts": artifacts}
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print()
    for c in checks:
        print(f"  {'PASS' if c['passed'] else 'FAIL'}  {c['id']:42} expected {c['expected']}  actual {c['actual']}")
    print(f"\n  {receipt['status'].upper()}: {sum(c['passed'] for c in checks)}/{len(checks)} checks · {len(artifacts)} artifacts · {out / 'receipt.json'}")
    sys.exit(0 if receipt["status"] == "passed" else 1)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    if argv[:1] == ["stage"]:
        stage = {"freecad": stage_freecad, "ifc": stage_ifc, "blender": stage_blender}[argv[1]]
        stage(Path(argv[2]))
    elif argv[:1] == ["all"]:
        all_stages(Path(argv[argv.index("--out") + 1]) if "--out" in argv else Path("/work/proof"))
    else:
        print(__doc__)
