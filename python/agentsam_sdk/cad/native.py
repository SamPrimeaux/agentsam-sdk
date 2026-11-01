"""Portable FreeCAD host selection and verified native-kernel execution.

This is a launcher/receipt layer. FreeCAD/OpenCascade own the geometry.
No arbitrary Python or user-supplied code is executed by this module.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping

_PREFIX = "AGENTSAM_RESULT="
_PROBE = (
    "import FreeCAD, Part, json\n"
    "shape = Part.makeBox(2, 3, 4)\n"
    "assert shape.isValid() and abs(shape.Volume - 24.0) < 1e-6\n"
    "print('AGENTSAM_RESULT=' + json.dumps({'ok': True, "
    "'version': '.'.join(FreeCAD.Version()[:3]), "
    "'volume': float(shape.Volume), 'kernel': 'OCCT'}))\n"
)


@dataclass(frozen=True)
class FreeCADHost:
    executable: str
    mode: str  # 'python' (bundled interpreter) or 'command' (FreeCADCmd)
    platform: str
    source: str
    library_dir: str | None = None

    def environment(self, base: Mapping[str, str] | None = None) -> dict[str, str]:
        env = dict(os.environ if base is None else base)
        home = env.get("HOME") or env.get("USERPROFILE") or str(Path.home())
        env.setdefault("HOME", home)
        if self.platform == "win32":
            env.setdefault("USERPROFILE", home)
        else:
            user = env.get("USER") or env.get("LOGNAME") or Path(home).name
            env.setdefault("USER", user)
            env.setdefault("LOGNAME", user)
        env.setdefault("FREECAD_USER_HOME", home)
        env.setdefault("QT_QPA_PLATFORM", "offscreen")
        if self.library_dir:
            separator = ";" if self.platform == "win32" else ":"
            paths = [self.library_dir]
            previous = env.get("PYTHONPATH", "")
            if previous:
                paths.append(previous)
            env["PYTHONPATH"] = separator.join(paths)
            if self.platform == "win32":
                env["PATH"] = separator.join(p for p in (self.library_dir, env.get("PATH")) if p)
        return env

    def adapter_command(self, adapter: str | Path, request: str | Path, operation: str = "build") -> list[str]:
        return [
            self.executable, str(adapter), "--operation", operation,
            "--request", str(request),
        ]


def discover_freecad(
    *,
    platform_name: str | None = None,
    environment: Mapping[str, str] | None = None,
    exists: Callable[[str], bool] | None = None,
    which: Callable[[str], str | None] | None = None,
) -> FreeCADHost | None:
    """Resolve an installed host, never infer capability from a binary alone.

    Override with AGENTSAM_FREECAD_PYTHON or AGENTSAM_FREECAD_CMD;
    AGENTSAM_FREECAD_HOME and AGENTSAM_FREECAD_LIB support custom installs.
    """
    platform_name = platform_name or sys.platform
    env = dict(os.environ if environment is None else environment)
    exists = exists or (lambda p: Path(p).is_file())
    which = which or shutil.which
    family = "win32" if platform_name.startswith("win") else "darwin" if platform_name == "darwin" else "linux"

    def host(candidate: str, mode: str, source: str, lib: str | None = None) -> FreeCADHost | None:
        path = which(candidate) or candidate
        if exists(path):
            return FreeCADHost(str(path), mode, family, source, lib)
        return None

    lib_override = env.get("AGENTSAM_FREECAD_LIB")
    py_override = env.get("AGENTSAM_FREECAD_PYTHON")
    if py_override:
        found = host(py_override, "python", "environment", lib_override)
        if found:
            return found
    cmd_override = env.get("AGENTSAM_FREECAD_CMD")
    if cmd_override:
        found = host(cmd_override, "command", "environment", lib_override)
        if found:
            return found

    homes = [env["AGENTSAM_FREECAD_HOME"]] if env.get("AGENTSAM_FREECAD_HOME") else []
    if family == "darwin":
        homes += ["/Applications/FreeCAD.app/Contents/Resources"]
        for home in homes:
            root = Path(home)
            lib = lib_override or str(root / "lib")
            for candidate in (root / "bin" / "python", root / "bin" / "python3"):
                found = host(str(candidate), "python", "native_bundle", lib)
                if found:
                    return found
            found = host(str(root / "bin" / "FreeCADCmd"), "command", "native_bundle", lib)
            if found:
                return found

    elif family == "win32":
        for root_name in ("ProgramFiles", "ProgramW6432", "ProgramFiles(x86)", "LOCALAPPDATA"):
            if env.get(root_name):
                base = Path(env[root_name])
                homes.extend(str(path) for path in (base.glob("FreeCAD*") if base.is_dir() else ()))
                homes.append(str(base / "Programs" / "FreeCAD"))
        seen: set[str] = set()
        for name in homes:
            if name in seen:
                continue
            seen.add(name)
            root = Path(name)
            for folder in (root / "bin", root):
                lib = lib_override or str(folder)
                for exe, mode in (("python.exe", "python"), ("FreeCADCmd.exe", "command")):
                    found = host(str(folder / exe), mode, "native_bundle", lib)
                    if found:
                        return found
    else:
        for home in homes:
            root = Path(home)
            for candidate, mode in ((root / "bin" / "python", "python"), (root / "bin" / "FreeCADCmd", "command")):
                found = host(str(candidate), mode, "configured_install", lib_override or str(root / "lib"))
                if found:
                    return found
        for lib in (lib_override, "/usr/lib/freecad/lib", "/usr/local/lib/freecad/lib"):
            if lib and exists(str(Path(lib) / "FreeCAD.so")):
                python = which("python3") or sys.executable
                found = host(python, "python", "system_python", lib)
                if found:
                    return found

    for name in ("FreeCADCmd.exe", "FreeCADCmd", "freecadcmd"):
        found = host(name, "command", "path", lib_override)
        if found:
            return found
    return None


def probe_freecad(host: FreeCADHost | None, *, timeout: int = 15) -> dict[str, object]:
    if host is None:
        return {"installed": False, "ready": False, "error": "freecad_host_not_found"}
    timeout = max(1, min(timeout, 60))
    try:
        with tempfile.TemporaryDirectory(prefix="agentsam-freecad-probe-") as directory:
            script = Path(directory) / "probe.py"
            script.write_text(_PROBE, encoding="utf-8")
            command = [host.executable, "-c", _PROBE] if host.mode == "python" else [host.executable, str(script)]
            result = subprocess.run(
                command, capture_output=True, text=True,
                env=host.environment(), timeout=timeout, check=False,
            )
        receipt = None
        for line in reversed(result.stdout.splitlines()):
            if line.startswith(_PREFIX):
                receipt = json.loads(line[len(_PREFIX):])
                break
        if result.returncode == 0 and isinstance(receipt, dict) and receipt.get("ok"):
            return {
                "installed": True, "ready": True, "binary": host.executable,
                "source": host.source, "platform": host.platform, **receipt,
            }
        return {
            "installed": True, "ready": False, "binary": host.executable,
            "error": "freecad_kernel_probe_failed",
            "detail": ((result.stderr or result.stdout or "no receipt")[-600:]),
            "exit_code": result.returncode,
        }
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError) as exc:
        return {
            "installed": True, "ready": False, "binary": host.executable,
            "error": "freecad_kernel_probe_failed", "detail": str(exc)[:600],
        }
