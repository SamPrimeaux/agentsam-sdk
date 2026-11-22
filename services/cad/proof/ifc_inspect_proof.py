#!/usr/bin/env python3
"""Acceptance proof for the IFC `inspect` adapter.

Checks the adapter's `agentsam.bim.model.v1` output against facts it did not
produce: entity counts read by parsing the raw STEP text of the IFC (no
IfcOpenShell), the file's SHA-256, relationship counts, and optionally a room
sidecar. Then runs the TypeScript contract's assertBimModel on the same output,
so Python and TypeScript agree on one model.

  python3 ifc_inspect_proof.py --ifc model.ifc --model model.json [--rooms rooms.json]

Stdlib only. Exits non-zero on the first failed check.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

STEP_ENTITY = re.compile(r"^#\d+\s*=\s*(IFC[A-Z0-9]+)\s*\(", re.MULTILINE)
REPO_ROOT = Path(__file__).resolve().parents[3]
_failures: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))
    if not ok:
        _failures.append(label)


def step_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for match in STEP_ENTITY.finditer(text):
        counts[match.group(1)] = counts.get(match.group(1), 0) + 1
    return counts


def contract_check(model_path: Path) -> None:
    node = shutil.which("node")
    dist = REPO_ROOT / "packages/agentsam-contracts/dist/bim-model.js"
    if not node or not dist.is_file():
        check(False, "TypeScript contract assertBimModel", "node or built contracts dist missing")
        return
    script = (
        "import {readFileSync} from 'node:fs';"
        f"const {{assertBimModel}}=await import({json.dumps(dist.as_uri())});"
        f"assertBimModel(JSON.parse(readFileSync({json.dumps(str(model_path))},'utf8')));"
        "console.log('ok');"
    )
    proc = subprocess.run([node, "--input-type=module", "-e", script], capture_output=True, text=True, check=False)
    check(proc.returncode == 0 and "ok" in proc.stdout, "TypeScript contract assertBimModel accepts the output",
          (proc.stderr or proc.stdout).strip()[-200:])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ifc", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--rooms")
    args = parser.parse_args()

    ifc_path, model_path = Path(args.ifc), Path(args.model)
    raw = ifc_path.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    model = json.loads(model_path.read_text(encoding="utf-8"))

    check(model.get("schema") == "agentsam.bim.model.v1", "schema tag")
    check(model["source"]["sha256"] == hashlib.sha256(raw).hexdigest(), "source sha256 matches the file")
    check(model["source"]["byteLength"] == len(raw), "source byteLength matches the file")
    check(model["truncated"] is False, "output not truncated")

    independent = step_counts(text)
    reported = {k.upper(): v for k, v in model["counts"].items()}
    check(reported == independent, "class counts equal raw STEP text counts",
          f"{sum(independent.values())} entities, {len(independent)} classes")

    elements, spaces = model["elements"], model["spaces"]
    by_id = {e["globalId"]: e for e in elements}
    check(len(spaces) == independent.get("IFCSPACE", 0), "space count equals IFCSPACE entities", str(len(spaces)))
    check(len(model["types"]) >= 1, "types present", str(len(model["types"])))
    check(len(by_id) == len(elements), "element GlobalIds unique")

    check(sum(1 for e in elements if e["fillsOpeningId"]) == independent.get("IFCRELFILLSELEMENT", 0),
          "fill chains equal IFCRELFILLSELEMENT entities")
    check(sum(1 for e in elements if e["hostId"]) == independent.get("IFCRELVOIDSELEMENT", 0),
          "void chains equal IFCRELVOIDSELEMENT entities")
    broken = [e["globalId"] for e in elements if e["fillsOpeningId"] and not by_id.get(e["fillsOpeningId"], {}).get("hostId")]
    check(not broken, "every filler sits in an opening that has a host", f"{len(broken)} broken")
    doors = [e for e in elements if e["ifcClass"] == "IfcDoor"]
    check(all(d["fillsOpeningId"] for d in doors), "every IfcDoor fills an opening", f"{len(doors)} doors")

    storeys = [n for n in _walk(model["spatial"]) if n["ifcClass"] == "IfcBuildingStorey"]
    check(len(storeys) == independent.get("IFCBUILDINGSTOREY", 0), "storey count equals IFCBUILDINGSTOREY entities",
          str(len(storeys)))
    check(all(s.get("elevationM") is not None for s in storeys), "every storey has an elevation")

    if args.rooms:
        sidecar = json.loads(Path(args.rooms).read_text(encoding="utf-8"))["rooms"]
        by_guid = {s["globalId"]: s for s in spaces}
        missing = [r["id"] for r in sidecar if r["guid"] not in by_guid]
        check(not missing, "every sidecar room found by GlobalId", f"{len(sidecar)} rooms")
        off = [r["id"] for r in sidecar if r["guid"] in by_guid
               and abs((by_guid[r["guid"]]["netFloorAreaM2"] or 0) - r["netAreaM2"]) > 0.01]
        check(not off, "net areas match the sidecar within 0.01 m2", f"{len(off)} off")
        check(all(by_guid[r["guid"]]["hasGeometry"] for r in sidecar if r["guid"] in by_guid), "all rooms report real geometry")
        net = sum(s["netFloorAreaM2"] or 0 for s in spaces)
        check(abs(net - sum(r["netAreaM2"] for r in sidecar)) < 0.5, "total net area matches the sidecar", f"{net:.2f} m2")

    contract_check(model_path)
    print("RESULT " + ("OK" if not _failures else f"FAILED ({len(_failures)})"))
    return 0 if not _failures else 1


def _walk(node: dict | None):
    if node:
        yield node
        for child in node["children"]:
            yield from _walk(child)


if __name__ == "__main__":
    sys.exit(main())
