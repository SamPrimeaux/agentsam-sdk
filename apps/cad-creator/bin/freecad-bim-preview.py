#!/usr/bin/env python3
"""Convert real FreeCAD solid geometry to a derived selectable glTF/GLB.
Runs with the FreeCAD bundled Python interpreter. Never saves the source document.
"""
import argparse
import hashlib
import json
import math
import os
import struct
import sys
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

FREECAD_LIB = str(Path(sys.executable).resolve().parent.parent / "lib")
if FREECAD_LIB not in sys.path:
    sys.path.insert(0, FREECAD_LIB)

import FreeCAD  # type: ignore
import MeshPart  # type: ignore


def _appearance(source: Path):
    with ZipFile(source) as archive:
        if "GuiDocument.xml" not in archive.namelist():
            return {}
        root = ElementTree.fromstring(archive.read("GuiDocument.xml"))
        result = {}
        for view in root.findall(".//ViewProvider"):
            flag = view.find(".//Property[@name='Visibility']/Bool")
            shape = view.find(".//Property[@name='ShapeAppearance']/MaterialList")
            rgb = None
            if shape is not None:
                filename = shape.get("file")
                if filename and filename in archive.namelist():
                    record = archive.read(filename)
                    # FreeCAD ShapeAppearance v3 stores a little-endian count,
                    # followed by 36-byte records. Diffuse ARGB is bytes 8..11.
                    if len(record) >= 40 and int.from_bytes(record[:4], "little") > 0:
                        rgb = tuple(record[9:12])
            result[view.attrib["name"]] = {
                "visible": flag is not None and flag.get("value") == "true",
                "rgb": rgb,
            }
    return result


def _pad(data: bytearray, align: int = 4):
    data.extend(b"\0" * (-len(data) % align))


def build(source: Path, output: Path, *, deflection: float = 32.0, working: bool = False):
    output.mkdir(parents=True, exist_ok=True)
    original = output / "source.FCStd"
    if working:
        if not original.exists():
            raise ValueError("Cannot refresh without an immutable imported source")
        if source != (output / "working.FCStd").resolve():
            raise ValueError("Refresh must use the library working copy")
    else:
        if original.exists() and hashlib.sha256(original.read_bytes()).digest() != hashlib.sha256(source.read_bytes()).digest():
            raise ValueError("Existing BIM library source differs; refusing overwrite")
        if not original.exists():
            original.write_bytes(source.read_bytes())
    appearance = _appearance(source)
    fallback_appearance = working and not appearance
    if fallback_appearance:
        # A headless FreeCAD save may omit GuiDocument.xml. Preserve the
        # original GUI visibility/colors without modifying the working file.
        appearance = _appearance(original)
    doc = FreeCAD.openDocument(str(source if working else original))
    try:
        objects = []
        buffers = bytearray()
        views, accessors, meshes, nodes = [], [], [], []
        materials = []
        material_lookup = {}
        def add_buffer(raw, target):
            _pad(buffers)
            idx = len(views)
            views.append({"buffer": 0, "byteOffset": len(buffers), "byteLength": len(raw), "target": target})
            buffers.extend(raw)
            return idx
        for item in doc.Objects:
            objects.append({
                "name": item.Name,
                "label": item.Label,
                "type": item.TypeId,
                "visible": appearance.get(item.Name, {}).get("visible", bool(fallback_appearance)),
                "inPreview": False,
                "color": appearance.get(item.Name, {}).get("rgb"),
                "parents": [o.Name for o in item.InList],
                "children": [o.Name for o in item.OutList],
            })
            if not appearance.get(item.Name, {}).get("visible", bool(fallback_appearance)) or not hasattr(item, "Shape") or item.Shape.isNull():
                continue
            if not item.Shape.Solids:
                continue
            try:
                tess = MeshPart.meshFromShape(Shape=item.Shape, LinearDeflection=deflection, AngularDeflection=0.5, Relative=False)
                points, tris = tess.Topology
                if not points or not tris:
                    continue
                # FreeCAD is Z-up and millimeters; glTF uses meters and Y-up.
                pos = [(float(v.x) * 0.001, float(v.z) * 0.001, -float(v.y) * 0.001) for v in points]
                indices = [int(j) for tri in tris for j in tri]
                vb = struct.pack("<" + "f" * (len(pos) * 3), *(c for xyz in pos for c in xyz))
                ib = struct.pack("<" + "I" * len(indices), *indices)
                bv = add_buffer(vb, 34962)
                ba = add_buffer(ib, 34963)
                xyzmin = [min(v[i] for v in pos) for i in range(3)]
                xyzmax = [max(v[i] for v in pos) for i in range(3)]
                vi = len(accessors)
                accessors.append({"bufferView": bv, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": xyzmin, "max": xyzmax})
                ai = len(accessors)
                accessors.append({"bufferView": ba, "componentType": 5125, "count": len(indices), "type": "SCALAR"})
                rgb = appearance.get(item.Name, {}).get("rgb") or (178, 189, 202)
                key = tuple(rgb)
                if key not in material_lookup:
                    material_lookup[key] = len(materials)
                    # glTF PBR factors are linear; source appearance is sRGB.
                    color = [((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92 for v in rgb]
                    materials.append({"name": "#%02x%02x%02x" % tuple(rgb), "doubleSided": True,
                        "pbrMetallicRoughness": {"baseColorFactor": color + [1.0], "metallicFactor": 0, "roughnessFactor": 0.85}})
                mi = len(meshes)
                meshes.append({"name": item.Label, "primitives": [{"attributes": {"POSITION": vi}, "indices": ai, "material": material_lookup[key]}]})
                nodes.append({"name": item.Label, "mesh": mi, "extras": {"freecadName": item.Name, "freecadType": item.TypeId}})
                objects[-1]["inPreview"] = True
            except Exception as error:
                objects[-1]["mesh_error"] = str(error)[:200]
        _pad(buffers)
        gltf = {
            "asset": {"version": "2.0", "generator": "AgentSam CAD Creator / native FreeCAD mesh derivative"},
            "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes,
            "materials": materials,
            "meshes": meshes, "buffers": [{"byteLength": len(buffers)}],
            "bufferViews": views, "accessors": accessors,
        }
        text = json.dumps(gltf, separators=(",", ":")).encode()
        text += b" " * (-len(text) % 4)
        total = 12 + 8 + len(text) + 8 + len(buffers)
        header = struct.pack("<4sII", b"glTF", 2, total)
        preview_bytes = header + struct.pack("<I4s", len(text), b"JSON") + text + struct.pack("<I4s", len(buffers), b"BIN\0") + buffers
        with ZipFile(source if working else original) as archive:
            if "thumbnails/Thumbnail.png" in archive.namelist():
                thumbnail_bytes = archive.read("thumbnails/Thumbnail.png")
            else:
                with ZipFile(original) as preserved:
                    thumbnail_bytes = preserved.read("thumbnails/Thumbnail.png")
        pinned_title = source.stem
        if working:
            prior_manifest = output / "manifest.json"
            if prior_manifest.exists():
                pinned_title = json.loads(prior_manifest.read_text()).get("title", output.name)
        meta = {
            "schema": "agentsam.cad.bim-starter.v1",
            "id": output.name,
            "title": pinned_title,
            "sourceFormat": "FCStd",
            "sourceSha256": hashlib.sha256(original.read_bytes()).hexdigest(),
            "previewSourceSha256": hashlib.sha256((source if working else original).read_bytes()).hexdigest(),
            "sourceFile": "source.FCStd", "previewFile": "preview.glb",
            "thumbnailFile": "thumbnail.png",
            "objectCount": len(objects), "meshCount": len(nodes), "materialCount": len(materials),
            "previewSha256": hashlib.sha256(preview_bytes).hexdigest(),
            "objects": objects, "previewIsDerived": True,
            "editingAuthority": "Native FreeCAD .FCStd",
            "appearanceFallback": bool(fallback_appearance),
        }
        # Stage all derivatives and publish manifest last; source.FCStd is never
        # overwritten, and a failed conversion cannot truncate a valid GLB.
        glb_temp = output / "preview.glb.tmp"
        thumb_temp = output / "thumbnail.png.tmp"
        manifest_temp = output / "manifest.json.tmp"
        try:
            glb_temp.write_bytes(preview_bytes)
            thumb_temp.write_bytes(thumbnail_bytes)
            manifest_temp.write_text(json.dumps(meta, indent=2) + "\n")
            os.replace(glb_temp, output / "preview.glb")
            os.replace(thumb_temp, output / "thumbnail.png")
            os.replace(manifest_temp, output / "manifest.json")
        finally:
            for temporary in (glb_temp, thumb_temp, manifest_temp):
                temporary.unlink(missing_ok=True)
        print(json.dumps({"id": meta["id"], "objectCount": len(objects), "meshCount": len(nodes), "previewBytes": total, "sourceHash": meta["sourceSha256"]}))
    finally:
        FreeCAD.closeDocument(doc.Name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--deflection-mm", type=float, default=32.0)
    parser.add_argument("--working", action="store_true", help="Refresh preview from the editable working.FCStd; keep source.FCStd unchanged")
    args = parser.parse_args()
    if not args.source.is_file() or not args.source.name.lower().endswith(".fcstd"):
        parser.error("Expected an existing .FCStd source")
    if not math.isfinite(args.deflection_mm) or args.deflection_mm <= 0:
        parser.error("Deflection must be positive")
    build(args.source.resolve(), args.output.resolve(), deflection=args.deflection_mm, working=args.working)
