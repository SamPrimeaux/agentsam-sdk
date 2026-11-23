#!/usr/bin/env python3
"""Read the actual Python argparse CLI without importing application code.

Used by the SDK universal registry generator. No runtime credentials, site state,
or repository-specific command lists. Python 3.10+ stdlib only.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CLI = ROOT / "cli.py"
PACKAGE = ROOT / "__init__.py"
PROJECT = ROOT.parent / "pyproject.toml"


def _literal(node):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError):
        return None


def inventory():
    tree = ast.parse(CLI.read_text(encoding="utf-8"), filename=str(CLI))
    parser = next(
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "build_parser"
    )
    # argparse builder variables represent a tree, not a flat list.
    parsers = {"ap": ()}
    subparsers = {}
    candidates = {}
    leaves = set()
    for node in ast.walk(parser):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if not isinstance(target, ast.Name) or not isinstance(node.value, ast.Call):
                continue
            call = node.value
            if not isinstance(call.func, ast.Attribute) or not isinstance(call.func.value, ast.Name):
                continue
            owner = call.func.value.id
            if call.func.attr == "add_subparsers" and owner in parsers:
                subparsers[target.id] = parsers[owner]
            elif call.func.attr == "add_parser" and owner in subparsers and call.args:
                segment = _literal(call.args[0])
                if not isinstance(segment, str) or not segment:
                    continue
                path = subparsers[owner] + (segment,)
                parsers[target.id] = path
                help_text = next((_literal(k.value) for k in call.keywords if k.arg == "help"), "")
                candidates[target.id] = {"words": list(path), "description": help_text or ""}
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "set_defaults" and isinstance(node.func.value, ast.Name):
                if any(k.arg == "func" for k in node.keywords):
                    leaves.add(node.func.value.id)
    commands = [candidates[name] for name in sorted(leaves) if name in candidates]
    commands.sort(key=lambda row: tuple(row["words"]))
    if not commands or len({tuple(row["words"]) for row in commands}) != len(commands):
        raise RuntimeError("Python CLI leaf dispatch could not be enumerated unambiguously")
    package_tree = ast.parse(PACKAGE.read_text(encoding="utf-8"), filename=str(PACKAGE))
    version = next(
        (_literal(node.value) for node in package_tree.body
         if isinstance(node, ast.Assign)
         and any(isinstance(t, ast.Name) and t.id == "__version__" for t in node.targets)),
        None,
    )
    project_text = PROJECT.read_text(encoding="utf-8")
    if 'name = "agentsam-sdk"' not in project_text or 'agentsam = "agentsam_sdk.cli:main"' not in project_text:
        raise RuntimeError("Python distribution or console-script entrypoint changed")
    if not isinstance(version, str) or not version:
        raise RuntimeError("Python distribution version unavailable")
    return {
        "schema": "agentsam.python-cli-source.v1",
        "package": "agentsam-sdk",
        "version": version,
        "executable": "agentsam",
        "source": "python/agentsam_sdk/cli.py",
        "commands": commands,
    }


if __name__ == "__main__":
    print(json.dumps(inventory(), indent=2, ensure_ascii=False))
