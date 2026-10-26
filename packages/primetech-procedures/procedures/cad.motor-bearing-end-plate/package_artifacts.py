#!/usr/bin/env python3
"""Create a reproducible artifact manifest and source-inclusive CAM delivery bundle."""
from __future__ import annotations
import hashlib, json, mimetypes, sys, zipfile
from pathlib import Path

SOURCE_NAMES = [
    "procedure.json", "run.py", "build_freecad.py", "generate_assets.py",
    "generate_toolpaths.py", "render_preview.py", "package_artifacts.py", "test_generate_toolpaths.py", "parameters.json",
]
EXCLUDED_OUTPUTS = {
    "delivery-manifest.json", "delivery-result.json",
    "motor-bearing-end-plate-cam-candidate-150mm.zip",
}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def json_write(path: Path, value: dict):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")

def media_type(path: Path) -> str:
    known = {
        ".FCStd": "application/octet-stream", ".step": "model/step", ".stp": "model/step",
        ".stl": "model/stl", ".nc": "text/plain", ".svg": "image/svg+xml",
        ".json": "application/json", ".html": "text/html", ".png": "image/png",
        ".md": "text/markdown",
    }
    return known.get(path.suffix, mimetypes.guess_type(path.name)[0] or "application/octet-stream")

def write_readme(out: Path):
    verification = json.loads((out / "verification.json").read_text(encoding="utf-8"))
    toolpath = json.loads((out / "toolpath-result.json").read_text(encoding="utf-8"))
    gcode_verification = json.loads((out / "gcode-verification.json").read_text(encoding="utf-8"))
    p = json.loads((out / "parameters-used.json").read_text(encoding="utf-8"))
    candidate = p["candidate"]
    lines = [
        "# CAM Model 01 — Motor / Bearing End Plate", "",
        "**Status: proposal only — not approved for manufacture.**", "",
        "## Candidate geometry", "",
        "- Part/revision: " + str(p.get("part_id", "motor-bearing-end-plate")) + " / " + str(p.get("revision", "candidate-150mm-001")),
        "- Material assumption: " + str(p.get("material", "6061-T6 aluminum")) + " (confirm before release)",
        f"- Outside diameter: {candidate['outer_diameter_mm']:g} mm",
        f"- Thickness: {candidate['thickness_mm']:g} mm",
        f"- Through bore: Ø{candidate['bore_diameter_mm']:g} mm nominal",
        f"- Bearing counterbore: Ø{candidate['counterbore_diameter_mm']:g} × {candidate['counterbore_depth_mm']:g} mm deep",
        f"- Clearance holes: {candidate['hole_count']} × Ø{candidate['hole_diameter_mm']:g} mm on Ø{candidate['bolt_circle_diameter_mm']:g} mm PCD",
        f"- Rounded pocket: {candidate['pocket_length_mm']:g} × {candidate['pocket_width_mm']:g} × {candidate['pocket_depth_mm']:g} mm, corner R{candidate['pocket_corner_radius_mm']:g}",
        f"- Outside edge treatment: {candidate['outer_chamfer_mm']:g} mm top chamfer", "",
        "## Design decision still required", "",
        "The original 120 mm OD layout is retained in spec-feasibility.json as the requested specification. The separate 60 × 30 mm pocket cannot be placed within that diameter while clearing the 52 mm bearing seat and staying inside the outer profile. Candidate B uses a 150 mm OD plate with the pocket placed tangentially at 45°. This is an explicit proposal, not an approved substitution.", "",
        "## Geometry evidence", "",
        "- Native FreeCAD document: motor-bearing-end-plate-candidate-150mm.FCStd",
        "- Neutral solid exchange: motor-bearing-end-plate-candidate-150mm.step",
        "- Mesh preview: motor-bearing-end-plate-candidate-150mm.stl",
        f"- STEP re-import checks: {len(verification.get('checks', [])) - len(verification.get('failed_checks', []))}/{len(verification.get('checks', []))} passed",
        f"- Re-imported STEP B-Rep: {verification['native_metrics']['solid_count']} solid; envelope {verification['native_metrics']['bounding_box_mm']['x']:g} × {verification['native_metrics']['bounding_box_mm']['y']:g} × {verification['native_metrics']['bounding_box_mm']['z']:.3f} mm",
        f"- Volume: {verification['native_metrics']['volume_mm3']:.3f} mm³",
        "- The saved STEP re-import is the envelope authority. A transient in-memory chamfer bounding-box measurement under-reported Y by about 0.047 mm; the verification note records the 0.1 mm numerical tolerance.", "",
        "## CAM review package", "",
        f"- Generated cutter-center moves: {toolpath['move_count']}",
        f"- Generic NC motion lines: {toolpath['gcode_motion_line_count']}",
        f"- Feed/rapid planning estimate: {toolpath['estimated_cycle_time_seconds'] / 60:.1f} minutes for the generated operations only",
        f"- G-code parser/geometry checks: {len(gcode_verification['checks']) - len([x for x in gcode_verification['checks'] if not x['pass']])}/{len(gcode_verification['checks'])} passed",
        "- toolpath.json contains explicit rapid, feed, and arc/helical moves.",
        "- toolpath-unverified.nc is generic Fanuc-style review output, not a qualified machine program.",
        "- The NC demo includes pocket roughing/finishing, four-hole peck drilling, center pilot drilling, through-bore interpolation, and counterbore interpolation.",
        "- Stock facing, outside-profile finishing, chamfering, fixture moves, and the second setup remain planned-only.", "",
        "## Not yet certified", "",
        "- No machine-specific postprocessor selected or tested.",
        "- No machine, clamp, fixture, workholding, tool-holder, or collision simulation.",
        "- Feeds and speeds are conservative starting values, not validated cutting data.",
        "- Ø40 H7 is not guaranteed by the nominal interpolation path; use a qualified finishing process and inspect the bore.",
        "- No physical machining is authorized by these artifacts.", "",
        "## Files", "",
        "- drawing.svg / drawing.html: dimensioned review drawing",
        "- part-preview.png: Blender render of the exported STL",
        "- presentation.html: six-slide engineering review",
        "- cam-plan.json: stock/WCS/setup/tool/operation plan",
        "- toolpath.json / toolpath-preview.svg: generated coordinate paths and backplot",
        "- toolpath-unverified.nc: generic review G-code",
        "- verification.json / gcode-verification.json: machine-readable checks",
        "- delivery-manifest.json: SHA-256 manifest for this bundle", "",
    ]
    (out / "README.md").write_text("\n".join(lines), encoding="utf-8")

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: package_artifacts.py output_dir procedure_dir")
    out = Path(sys.argv[1]).resolve(strict=True)
    proc = Path(sys.argv[2]).resolve(strict=True)
    write_readme(out)
    source_rows = []
    for name in SOURCE_NAMES:
        source = proc / name
        if not source.is_file():
            raise SystemExit("pipeline source missing: " + name)
        source_rows.append({"path": "pipeline-source/" + name, "bytes": source.stat().st_size, "sha256": sha256(source)})
    files = []
    for path in sorted(out.iterdir(), key=lambda item: item.name):
        if not path.is_file() or path.name in EXCLUDED_OUTPUTS or path.name == "delivery-manifest.json":
            continue
        if path.name.startswith("freecad-") or path.suffix in (".pyc", ".tmp"):
            continue
        files.append({"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path), "media_type": media_type(path)})
    manifest = {
        "schema": "inneranimalmedia.cam.delivery-manifest.v1",
        "part_id": "motor-bearing-end-plate",
        "revision": "candidate-150mm-001",
        "design_status": "proposal_not_approved",
        "artifact_directory": str(out),
        "files": files,
        "pipeline_source": source_rows,
        "limitations": [
            "Candidate 150 mm OD requires owner approval; original 120 mm OD spec remains recorded.",
            "Generic Fanuc-style G-code is unverified for any machine or postprocessor.",
            "No collision simulation, fixture validation, or physical machining.",
            "Ø40 H7 tolerance requires a qualified finishing process and inspection."
        ]
    }
    manifest_path = out / "delivery-manifest.json"
    json_write(manifest_path, manifest)
    zip_path = out / "motor-bearing-end-plate-cam-candidate-150mm.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive_items = [(out / row["name"], row["name"]) for row in files]
        archive_items.append((manifest_path, manifest_path.name))
        archive_items.extend((proc / name, "pipeline-source/" + name) for name in SOURCE_NAMES)
        for source, arcname in sorted(archive_items, key=lambda item: item[1]):
            info = zipfile.ZipInfo(arcname, date_time=(2026, 10, 22, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    result = {
        "schema": "inneranimalmedia.cam.delivery-result.v1",
        "ok": True,
        "zip_name": zip_path.name,
        "zip_bytes": zip_path.stat().st_size,
        "zip_sha256": sha256(zip_path),
        "manifest_name": manifest_path.name,
        "manifest_sha256": sha256(manifest_path),
        "file_count": len(files),
        "total_bytes": sum(row["bytes"] for row in files),
        "pipeline_source_count": len(source_rows),
    }
    json_write(out / "delivery-result.json", result)
    print(json.dumps(result, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
