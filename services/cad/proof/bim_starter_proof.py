#!/usr/bin/env python3
"""BIM starter acceptance run: do a published starter's claims hold up across independent engines?

Fetches a starter from its public URLs and checks the manifest against the source and the preview:
  source sha256 | object count (file vs manifest vs FreeCAD API) | GLB meshes/materials vs manifest |
  GLB validity | FreeCAD solids -> STEP -> native OCCT volume | preview extents vs source extents | Blender render.

Run inside the agentsam-cad image (network needed for the download):
  docker run --rm -i --user root -e HOME=/tmp/home --entrypoint sh agentsam-cad:latest \
    -c 'cat > /tmp/p.py && python3 /tmp/p.py all archdetail bimexample' < services/cad/proof/bim_starter_proof.py
"""
from __future__ import annotations

import hashlib, json, math, os, re, struct, subprocess, sys, urllib.request, zipfile
from pathlib import Path

BASE = "https://cadstorage.inneranimalmedia.com/library/bim-starters"
TITLES = {"archdetail": "ArchDetail", "bimexample": "BIMExample"}
WD = Path("/tmp/bim")
SELF = Path(__file__).resolve()


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def fetch(sid):
    t = TITLES[sid]
    (WD / sid).mkdir(parents=True, exist_ok=True)
    for name in (f"{t}-FreeCAD-Source.FCStd", f"{t}-Manifest.json", f"{t}-Interactive-Preview.glb"):
        data = urllib.request.urlopen(urllib.request.Request(f"{BASE}/{sid}/{name}", headers={"User-Agent": "agentsam-proof"}), timeout=60).read()
        (WD / sid / name).write_bytes(data)


def stage_freecad(sid):
    sys.path.append("/usr/lib/freecad/lib")
    import FreeCAD, Part
    t = TITLES[sid]
    manifest = json.loads((WD / sid / f"{t}-Manifest.json").read_text())
    doc = FreeCAD.openDocument(str(WD / sid / f"{t}-FreeCAD-Source.FCStd"))
    preview = {o["name"] for o in manifest["objects"] if o.get("inPreview")}
    solids, valid, shaped, volume, box = [], 0, 0, 0.0, FreeCAD.BoundBox()
    for o in doc.Objects:
        try:
            s = o.Shape
        except Exception:
            continue
        if s.isNull():
            continue
        shaped += 1
        if o.Name in preview:
            valid += 1 if s.isValid() else 0
            box.add(s.BoundBox)
            for sol in s.Solids:
                solids.append(sol)
                volume += sol.Volume
    step = WD / sid / "preview-solids.step"
    if solids:
        Part.makeCompound(solids).exportStep(str(step))
    (WD / sid / "freecad.json").write_text(json.dumps({
        "api_objects": len(doc.Objects), "shaped": shaped, "preview_objects": len(preview), "preview_valid": valid, "solids": len(solids),
        "volume_mm3": volume, "extents_mm": sorted([box.XLength, box.YLength, box.ZLength]), "step": step.is_file(),
        "freecad": ".".join(str(x) for x in FreeCAD.Version()[:3])}))


def stage_blender(sid):
    import bpy, math
    import numpy as np
    # Blender 3.4's bundled glTF importer uses numpy aliases that NumPy >= 1.24 removed (np.bool, ...).
    for alias, real in (('bool', bool), ('int', int), ('float', float), ('object', object), ('str', str)):
        if not hasattr(np, alias):
            setattr(np, alias, real)
    from mathutils import Vector
    t = TITLES[sid]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(WD / sid / f"{t}-Interactive-Preview.glb"))
    lo, hi = [1e18] * 3, [-1e18] * 3
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], w[i]), max(hi[i], w[i])
    ext = [hi[i] - lo[i] for i in range(3)]
    center = Vector([(hi[i] + lo[i]) / 2 for i in range(3)])
    radius = math.sqrt(sum(e * e for e in ext)) * 0.9
    scene = bpy.context.scene
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); scene.collection.objects.link(cam); scene.camera = cam
    cam.location = center + Vector((radius, -radius, radius * 0.6))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_end = radius * 20
    sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.rotation_euler = (0.9, 0.2, 0.8); scene.collection.objects.link(sun)
    scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 6; scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 640, 360, 100
    out = WD / sid / "render.png"; scene.render.filepath = str(out); bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(str(out)); px = list(img.pixels)[0::4]
    mean = sum(px) / len(px); std = math.sqrt(sum((p - mean) ** 2 for p in px) / len(px))
    (WD / sid / "blender.json").write_text(json.dumps({"extents_m": sorted(ext), "meshes": sum(1 for o in scene.objects if o.type == "MESH"), "pixel_std": std, "blender": bpy.app.version_string}))


def glb_info(path):
    b = path.read_bytes()
    magic, ver, _ = struct.unpack("<4sII", b[:12]); n, kind = struct.unpack("<I4s", b[12:20])
    return json.loads(b[20:20 + n]) if magic == b"glTF" and kind == b"JSON" else {}


def prove(sid):
    t = TITLES[sid]; d = WD / sid
    fetch(sid)
    manifest = json.loads((d / f"{t}-Manifest.json").read_text())
    src = d / f"{t}-FreeCAD-Source.FCStd"; glb = d / f"{t}-Interactive-Preview.glb"
    env = {**os.environ, "QT_QPA_PLATFORM": "offscreen"}
    for name, cmd in (("freecad", [sys.executable, str(SELF), "stage", "freecad", sid]), ("blender", ["blender", "-b", "--factory-startup", "--python-exit-code", "1", "--python", str(SELF), "--", "stage", "blender", sid])):
        r = run(cmd, env=env)
        if r.returncode != 0:
            print(f"  stage {name} FAILED\n{(r.stdout + r.stderr)[-1200:]}"); return [("stage-" + name, False, "ran", "failed")]
    fc = json.loads((d / "freecad.json").read_text()); bl = json.loads((d / "blender.json").read_text())
    xml = zipfile.ZipFile(src).read("Document.xml").decode("utf8", "ignore")
    in_file = len(re.findall(r'<Object type="', xml)); gj = glb_info(glb)
    checks = []
    def chk(i, ok, exp, act): checks.append((i, bool(ok), exp, act))
    chk("source-sha256-matches-manifest", hashlib.sha256(src.read_bytes()).hexdigest() == manifest["sourceSha256"], manifest["sourceSha256"][:16] + "...", hashlib.sha256(src.read_bytes()).hexdigest()[:16] + "...")
    chk("preview-derived-from-same-source", manifest["previewSourceSha256"] == manifest["sourceSha256"] and manifest.get("previewIsDerived") is True, "preview sha == source sha", manifest["previewSourceSha256"] == manifest["sourceSha256"])
    chk("object-count-file-vs-manifest", in_file == manifest["objectCount"] == len(manifest["objects"]), manifest["objectCount"], f"file {in_file}, listed {len(manifest['objects'])}")
    chk("freecad-opens-all-objects", fc["api_objects"] == manifest["objectCount"], manifest["objectCount"], fc["api_objects"])
    chk("glb-meshes-match-manifest", len(gj.get("meshes", [])) == manifest["meshCount"], manifest["meshCount"], len(gj.get("meshes", [])))
    chk("glb-materials-match-manifest", len(gj.get("materials", [])) == manifest["materialCount"], manifest["materialCount"], len(gj.get("materials", [])))
    v = run(["gltf-transform", "validate", str(glb)]); chk("glb-validates", "No errors found" in v.stdout + v.stderr, "validator: no errors", "ok" if "No errors found" in v.stdout + v.stderr else (v.stdout + v.stderr)[-90:])
    if fc["step"]:
        m = re.search(r"AGENTSAM_RESULT=(\{.*\})", run(["agentsam-occt", "--inspect", str(d / "preview-solids.step")]).stdout)
        ov = json.loads(m.group(1))["volume_mm3"] if m else None
        chk("native-occt-reads-freecad-solids", ov is not None and abs(ov - fc["volume_mm3"]) / max(fc["volume_mm3"], 1) < 1e-6, f"{fc['volume_mm3']:.1f} mm3 ({fc['solids']} solids)", None if ov is None else f"{ov:.1f} mm3")
    ratios = [(b_ * 1000) / a_ for a_, b_ in zip(fc["extents_mm"], bl["extents_m"]) if a_ > 1e-6]
    chk("preview-extents-match-source", ratios and all(abs(r - 1) < 0.02 for r in ratios), "within 2% of source extents (mm)", f"ratios {[round(r, 3) for r in ratios]}")
    chk("blender-renders-the-preview", bl["pixel_std"] > 0.01 and bl["meshes"] > 0, f"{len(gj.get('meshes', []))} meshes, non-flat image", f"{bl['meshes']} meshes, pixel std {bl['pixel_std']:.3f}")
    return checks


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    if argv[:1] == ["stage"]:
        {"freecad": stage_freecad, "blender": stage_blender}[argv[1]](argv[2])
    else:
        ids = [a for a in argv if a in TITLES] or list(TITLES)
        failed = 0
        for sid in ids:
            print(f"\n=== {TITLES[sid]} ({sid}) ===")
            res = prove(sid)
            for i, ok, exp, act in res: print(f"  {'PASS' if ok else 'FAIL'}  {i:38} expected {exp}  actual {act}")
            failed += sum(1 for r in res if not r[1])
            print(f"  -> {sum(1 for r in res if r[1])}/{len(res)} checks passed")
        sys.exit(1 if failed else 0)
