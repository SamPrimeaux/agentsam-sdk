#!/usr/bin/env python3
"""PrimeTech entrypoint: one native FreeCAD build, then deterministic CAM packaging."""
from __future__ import annotations
import hashlib, json, os, re, shutil, subprocess, sys
from pathlib import Path

RESULT_SCHEMA = "inneranimalmedia.cam.pipeline-result.v1"
DEFAULT_OUTPUT = ".agentsam/artifacts/cam/motor-bearing-end-plate/candidate-150mm"
OUTPUT_PATTERN = re.compile(r"^\.agentsam/artifacts/cam/[a-z0-9-]+/[a-z0-9-]+$")

class PipelineError(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message)
        self.code = code
        self.details = details or {}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def json_read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def discover_freecad():
    env = os.environ
    explicit_python = env.get("AGENTSAM_FREECAD_PYTHON")
    explicit_resources = env.get("AGENTSAM_FREECAD_RESOURCES")
    if explicit_python:
        py = Path(explicit_python).expanduser().resolve()
        if not py.is_file():
            raise PipelineError("freecad_python_unavailable", "AGENTSAM_FREECAD_PYTHON does not resolve to a file.")
        resources = Path(explicit_resources).expanduser().resolve() if explicit_resources else (
            py.parent.parent if py.parent.name == "bin" else None
        )
        return py, resources
    candidates = [
        env.get("FREECAD_BIN"),
        shutil.which("freecadcmd"),
        shutil.which("FreeCAD"),
        shutil.which("freecad"),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        binary = Path(candidate).expanduser().resolve()
        resources = None
        if binary.parent.name == "bin" and binary.parent.parent.name == "Resources":
            resources = binary.parent.parent
        else:
            for parent in binary.parents:
                if parent.name == "Contents":
                    resources = parent / "Resources"
                    break
        if resources:
            py = resources / "bin" / "python"
            if py.is_file():
                return py, resources
    raise PipelineError(
        "freecad_runtime_unavailable",
        "Native FreeCAD Python was not discovered. Configure AGENTSAM_FREECAD_PYTHON or FREECAD_BIN; the pipeline will not substitute a mesh-only model.",
    )

def run_checked(argv, cwd: Path, env: dict, timeout: int, label: str):
    try:
        result = subprocess.run(argv, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError(label + "_timeout", label + " exceeded its time limit.") from exc
    if result.returncode != 0:
        stderr_tail = (result.stderr or result.stdout or "")[-1200:]
        raise PipelineError(
            label + "_failed",
            label + " failed with exit code " + str(result.returncode) + ".",
            {"exit_code": result.returncode, "stderr_tail": stderr_tail},
        )
    return result

def discover_blender():
    for candidate in (
        os.environ.get("AGENTSAM_BLENDER_BIN"),
        os.environ.get("BLENDER_BIN"),
        shutil.which("blender"),
    ):
        if candidate and Path(candidate).expanduser().is_file():
            return str(Path(candidate).expanduser().resolve())
    raise PipelineError("blender_runtime_unavailable", "Set AGENTSAM_BLENDER_BIN or BLENDER_BIN to a Blender executable.")

def result_error(error: PipelineError):
    print(json.dumps({
        "schema": RESULT_SCHEMA,
        "ok": False,
        "error": error.code,
        "message": str(error),
        "details": error.details,
    }, sort_keys=True))

def main():
    try:
        if len(sys.argv) != 2:
            raise PipelineError("procedure_input_required", "Expected one JSON input object.")
        try:
            payload = json.loads(sys.argv[1])
        except Exception as exc:
            raise PipelineError("procedure_input_invalid", "Input must be valid JSON.") from exc
        if not isinstance(payload, dict) or set(payload) - {"variant", "output_dir"}:
            raise PipelineError("procedure_input_invalid", "Only variant and output_dir are accepted.")
        variant = payload.get("variant")
        if variant != "candidate-150mm":
            raise PipelineError("procedure_variant_unsupported", "This version only builds the explicit candidate-150mm variant.")
        output_rel = payload.get("output_dir", DEFAULT_OUTPUT)
        if not isinstance(output_rel, str) or not OUTPUT_PATTERN.fullmatch(output_rel):
            raise PipelineError("procedure_output_path_invalid", "output_dir must remain under .agentsam/artifacts/cam/<part>/<revision>.")
        project_root = Path.cwd().resolve(strict=True)
        out = (project_root / output_rel).resolve()
        if project_root not in out.parents:
            raise PipelineError("procedure_output_path_invalid", "Output path resolved outside the selected project root.")
        proc_dir = Path(__file__).resolve().parent
        parameters = proc_dir / "parameters.json"
        if not parameters.is_file():
            raise PipelineError("procedure_parameters_missing", "The packaged parameter source is missing.")
        out.mkdir(parents=True, exist_ok=True)

        freecad_python, resources = discover_freecad()
        env = os.environ.copy()
        if resources:
            paths = [str(resources / "lib"), str(resources / "Mod")]
            if env.get("PYTHONPATH"):
                paths.append(env["PYTHONPATH"])
            env["PYTHONPATH"] = os.pathsep.join(paths)
        python_bin = shutil.which("python3.12") or shutil.which("python3") or sys.executable

        run_checked([
            str(freecad_python), str(proc_dir / "build_freecad.py"),
            "--parameters", str(parameters), "--output-dir", str(out), "--variant", variant,
        ], project_root, env, 240, "freecad_build")
        build = json_read(out / "build-result.json")
        geometry = json_read(out / "verification.json")
        if build.get("ok") is not True or geometry.get("all_checks_pass") is not True:
            raise PipelineError("geometry_verification_failed", "Native FreeCAD build did not pass every geometry check.")

        run_checked([
            python_bin, str(proc_dir / "generate_assets.py"),
            str(parameters), str(out / "verification.json"), str(out),
        ], project_root, env, 120, "drawing_and_presentation")
        run_checked([
            python_bin, str(proc_dir / "generate_toolpaths.py"),
            "--parameters", str(parameters), "--output-dir", str(out),
        ], project_root, env, 120, "toolpath_generation")
        blender = discover_blender()
        run_checked([
            blender, "-b", "--python", str(proc_dir / "render_preview.py"), "--",
            str(out / "motor-bearing-end-plate-candidate-150mm.stl"),
            str(out / "part-preview.png"),
        ], project_root, env, 240, "blender_preview")
        run_checked([
            python_bin, str(proc_dir / "package_artifacts.py"), str(out), str(proc_dir),
        ], project_root, env, 120, "artifact_packaging")

        build = json_read(out / "build-result.json")
        geometry = json_read(out / "verification.json")
        toolpath = json_read(out / "toolpath-result.json")
        gcode_verification = json_read(out / "gcode-verification.json")
        delivery = json_read(out / "delivery-result.json")
        if not build.get("ok") or not toolpath.get("verification_pass") or not gcode_verification.get("all_checks_pass"):
            raise PipelineError("pipeline_verification_failed", "One or more geometry, toolpath, or NC syntax checks failed.")
        files = []
        for path in sorted(out.iterdir(), key=lambda item: item.name):
            if path.is_file() and path.suffix not in (".pyc", ".tmp"):
                files.append({"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)})
        result = {
            "schema": RESULT_SCHEMA,
            "ok": True,
            "part_id": "motor-bearing-end-plate",
            "revision": build.get("revision", "candidate-150mm-001"),
            "design_status": "proposal_not_approved",
            "artifact_directory": output_rel,
            "files": files,
            "verification": {
                "geometry_checks_pass": geometry["all_checks_pass"],
                "toolpath_checks_pass": gcode_verification["all_checks_pass"],
                "geometry_check_count": len(geometry.get("checks", [])),
                "toolpath_check_count": len(gcode_verification.get("checks", [])),
                "gcode_motion_line_count": toolpath["gcode_motion_line_count"],
                "failed_geometry_checks": [row["check"] for row in geometry.get("checks", []) if not row.get("pass")],
            },
            "toolpath": {
                "dialect": toolpath["dialect"],
                "status": toolpath["post_status"],
                "move_count": toolpath["move_count"],
                "gcode_sha256": toolpath["gcode_sha256"],
                "estimated_cycle_time_seconds": toolpath["estimated_cycle_time_seconds"],
            },
            "delivery": {
                "zip_name": delivery["zip_name"],
                "zip_sha256": delivery["zip_sha256"],
                "manifest_name": delivery["manifest_name"],
                "manifest_sha256": delivery["manifest_sha256"],
                "file_count": delivery["file_count"],
                "total_bytes": delivery["total_bytes"],
            },
        }
        print(json.dumps(result, sort_keys=True))
        return 0
    except PipelineError as exc:
        result_error(exc)
        return 0
    except Exception as exc:
        result_error(PipelineError("cad_pipeline_failed", str(exc)[:500]))
        return 0

if __name__ == "__main__":
    raise SystemExit(main())
