#!/usr/bin/env python3
"""Acceptance tests for the IFC validate / diff / edit adapter operations.

Builds a real building with IfcOpenShell (project, site, building, storey, a wall
with an extruded body, an opening in it and a door filling that opening), then
drives the adapter exactly as the CAD service and the SDK do: a request file in,
an AGENTSAM_RESULT line out. Skips when IfcOpenShell is not importable.

  python3 services/cad/proof/ifc_edit_test.py
"""

from __future__ import annotations

import hashlib
import importlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

try:
    import ifcopenshell
    import ifcopenshell.api

    numpy: Any = importlib.import_module("numpy")
    HAVE_IFC = True
except ImportError:
    HAVE_IFC = False

ADAPTER = Path(__file__).resolve().parents[1] / "ifc" / "adapter.py"
PREFIX = "AGENTSAM_RESULT="


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_adapter(operation: str, request: dict[str, Any], cwd: Path) -> tuple[int, dict[str, Any]]:
    request_path = cwd / f"{operation}-request.json"
    request_path.write_text(json.dumps({"schema_version": 1, **request}), encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, str(ADAPTER), "--operation", operation, "--request", str(request_path)],
        capture_output=True, text=True, check=False, cwd=cwd,
    )
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith(PREFIX):
            return proc.returncode, json.loads(line[len(PREFIX):])
    raise AssertionError(f"no result line: {proc.stdout!r} {proc.stderr[-800:]!r}")


def build_house(path: Path) -> dict[str, str]:
    """A 4 m x 2.8 m x 0.2 m wall with a door opening; the door's placement is
    relative to the wall's so moving the wall must carry the door."""
    api = ifcopenshell.api
    f = api.run("project.create_file", version="IFC4")
    project = api.run("root.create_entity", f, ifc_class="IfcProject", name="Test House")
    api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    model = api.run("context.add_context", f, context_type="Model")
    body = api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                   target_view="MODEL_VIEW", parent=model)
    site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="House")
    storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Level 1")
    api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    api.run("aggregate.assign_object", f, products=[building], relating_object=site)
    api.run("aggregate.assign_object", f, products=[storey], relating_object=building)

    wall = api.run("root.create_entity", f, ifc_class="IfcWall", name="North Wall")
    api.run("geometry.assign_representation", f, product=wall,
            representation=api.run("geometry.add_wall_representation", f, context=body,
                                   length=4.0, height=2.8, thickness=0.2))
    api.run("geometry.edit_object_placement", f, product=wall, matrix=numpy.eye(4))
    api.run("spatial.assign_container", f, products=[wall], relating_structure=storey)

    opening = api.run("root.create_entity", f, ifc_class="IfcOpeningElement", name="Door Opening")
    door = api.run("root.create_entity", f, ifc_class="IfcDoor", name="Front Door")
    for product in (opening, door):
        product.ObjectPlacement = f.createIfcLocalPlacement(
            wall.ObjectPlacement, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((1.0, 0.0, 0.0))))
    api.run("feature.add_feature", f, feature=opening, element=wall)
    api.run("feature.add_filling", f, opening=opening, element=door)
    api.run("spatial.assign_container", f, products=[door], relating_structure=storey)
    f.write(str(path))
    return {"wall": wall.GlobalId, "door": door.GlobalId, "opening": opening.GlobalId,
            "storey": storey.GlobalId}


@unittest.skipUnless(HAVE_IFC, "ifcopenshell not importable")
class IfcAuthoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.source = self.dir / "house.ifc"
        self.ids = build_house(self.source)
        self.base = sha256(self.source)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def edit(self, edits: list[dict[str, Any]], name: str = "out.ifc") -> tuple[int, dict[str, Any]]:
        return run_adapter("edit", {"input": str(self.source), "output": str(self.dir / name),
                                    "base_sha256": self.base, "edits": edits}, self.dir)

    def test_validate_reports_a_clean_building(self) -> None:
        code, result = run_adapter("validate", {"input": str(self.source)}, self.dir)
        self.assertEqual(code, 0, result)
        self.assertTrue(result["data"]["valid"], result["data"]["issues"])

    def test_attribute_edit_changes_only_that_object_and_keeps_every_id(self) -> None:
        code, result = self.edit([{"op": "attribute.set", "globalId": self.ids["wall"],
                                   "attribute": "Name", "value": "North Wall (rev B)"}])
        self.assertEqual(code, 0, result)
        data = result["data"]
        self.assertEqual(data["diff"]["counts"]["changed"], 1)
        self.assertEqual(data["diff"]["counts"]["added"] + data["diff"]["counts"]["removed"], 0)
        change = data["diff"]["changed"][0]
        self.assertEqual(change["globalId"], self.ids["wall"])
        self.assertEqual(change["fields"]["attributes.Name"]["to"], "North Wall (rev B)")
        self.assertEqual(sha256(self.source), self.base, "source must never be modified")
        self.assertEqual(data["output"]["sha256"], sha256(self.dir / "out.ifc"))

    def test_independent_reopen_matches_the_edit(self) -> None:
        self.edit([{"op": "attribute.set", "globalId": self.ids["wall"], "attribute": "Name", "value": "X"}])
        reopened = ifcopenshell.open(str(self.dir / "out.ifc"))
        self.assertEqual(reopened.by_guid(self.ids["wall"]).Name, "X")
        original = ifcopenshell.open(str(self.source))
        self.assertEqual(
            sorted(e.GlobalId for e in original.by_type("IfcRoot")),
            sorted(e.GlobalId for e in reopened.by_type("IfcRoot")),
        )

    def test_property_set_and_remove(self) -> None:
        code, result = self.edit([{"op": "property.set", "globalId": self.ids["wall"],
                                   "pset": "Pset_WallCommon", "name": "FireRating", "value": "2HR"}])
        self.assertEqual(code, 0, result)
        change = result["data"]["diff"]["changed"][0]
        self.assertEqual(change["fields"]["psets.Pset_WallCommon.FireRating"]["to"], "2HR")
        self.source = self.dir / "out.ifc"
        self.base = sha256(self.source)
        code, result = self.edit([{"op": "property.remove", "globalId": self.ids["wall"],
                                   "pset": "Pset_WallCommon", "name": "FireRating"}], "out2.ifc")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["data"]["diff"]["counts"]["changed"], 1)

    def test_extrusion_depth_edit_is_real_geometry(self) -> None:
        code, result = self.edit([{"op": "solid.extrusion_depth", "globalId": self.ids["wall"], "depth_m": 3.2}])
        self.assertEqual(code, 0, result)
        change = result["data"]["diff"]["changed"][0]
        fields = [v for k, v in change["fields"].items() if k.startswith("geometry")]
        self.assertTrue(fields, change)
        reopened = ifcopenshell.open(str(self.dir / "out.ifc"))
        solid = reopened.by_guid(self.ids["wall"]).Representation.Representations[0].Items[0]
        self.assertAlmostEqual(solid.Depth, 3.2, places=6)

    def test_moving_a_wall_carries_the_objects_placed_relative_to_it(self) -> None:
        code, result = self.edit([{"op": "placement.move", "globalId": self.ids["wall"], "delta_m": [0, 2.5, 0]}])
        self.assertEqual(code, 0, result)
        moved = {c["globalId"] for c in result["data"]["diff"]["changed"]}
        self.assertIn(self.ids["wall"], moved)
        reopened = ifcopenshell.open(str(self.dir / "out.ifc"))
        from ifcopenshell.util import placement

        wall_y = placement.get_local_placement(reopened.by_guid(self.ids["wall"]).ObjectPlacement)[1][3]
        door_y = placement.get_local_placement(reopened.by_guid(self.ids["door"]).ObjectPlacement)[1][3]
        self.assertAlmostEqual(wall_y, 2.5, places=6)
        self.assertAlmostEqual(door_y, 2.5, places=6)

    def test_removing_a_wall_needs_cascade_then_takes_its_opening_and_door(self) -> None:
        code, result = self.edit([{"op": "element.remove", "globalId": self.ids["wall"]}])
        self.assertNotEqual(code, 0)
        self.assertIn("hosted_fillings", result["error"])
        self.assertFalse((self.dir / "out.ifc").exists())
        code, result = self.edit([{"op": "element.remove", "globalId": self.ids["wall"], "cascade": True}])
        self.assertEqual(code, 0, result)
        removed = {r["globalId"] for r in result["data"]["diff"]["removed"]}
        self.assertEqual(removed, {self.ids["wall"], self.ids["door"], self.ids["opening"]})

    def test_a_bad_edit_anywhere_writes_nothing(self) -> None:
        code, result = self.edit([
            {"op": "attribute.set", "globalId": self.ids["wall"], "attribute": "Name", "value": "ok"},
            {"op": "attribute.set", "globalId": "0000000000000000000000", "attribute": "Name", "value": "no"},
        ])
        self.assertNotEqual(code, 0)
        self.assertIn("edit[1]", result["error"])
        self.assertFalse((self.dir / "out.ifc").exists())

    def test_refusals(self) -> None:
        cases = [
            ([{"op": "attribute.set", "globalId": self.ids["wall"], "attribute": "GlobalId", "value": "x"}],
             "attribute_not_editable"),
            ([{"op": "attribute.set", "globalId": self.ids["wall"], "attribute": "Name", "value": 5}],
             "must_be_string_or_null"),
            ([{"op": "property.set", "globalId": self.ids["wall"], "pset": "Qto_WallBaseQuantities",
               "name": "Length", "value": 1.0}], "quantity_sets_are_derived"),
            ([{"op": "placement.move", "globalId": self.ids["wall"], "delta_m": [0, 0]}], "three_numbers"),
            ([{"op": "solid.extrusion_depth", "globalId": self.ids["wall"], "depth_m": -1}], "out_of_range"),
            ([{"op": "element.remove", "globalId": self.ids["storey"]}], "not_removable"),
            ([{"op": "run.code", "globalId": self.ids["wall"]}], "op_must_be_one_of"),
        ]
        for edits, expected in cases:
            with self.subTest(expected=expected):
                code, result = self.edit(edits)
                self.assertNotEqual(code, 0)
                self.assertIn(expected, result["error"])
                self.assertFalse((self.dir / "out.ifc").exists())

    def test_stale_base_and_existing_output_are_refused(self) -> None:
        stale = {"input": str(self.source), "output": str(self.dir / "out.ifc"), "base_sha256": "0" * 64,
                 "edits": [{"op": "attribute.set", "globalId": self.ids["wall"], "attribute": "Name", "value": "x"}]}
        code, result = run_adapter("edit", stale, self.dir)
        self.assertNotEqual(code, 0)
        self.assertIn("ifc_edit_base_conflict", result["error"])
        (self.dir / "out.ifc").write_text("exists")
        code, result = self.edit([{"op": "attribute.set", "globalId": self.ids["wall"],
                                   "attribute": "Name", "value": "x"}])
        self.assertIn("output_exists", result["error"])
        code, result = run_adapter("edit", {**stale, "output": str(self.source), "base_sha256": self.base},
                                   self.dir)
        self.assertIn("output_exists", result["error"])

    def test_diff_of_identical_files_is_empty_and_preserves_identity(self) -> None:
        copy = self.dir / "copy.ifc"
        copy.write_bytes(self.source.read_bytes())
        code, result = run_adapter("diff", {"input": str(self.source), "other": str(copy)}, self.dir)
        self.assertEqual(code, 0, result)
        data = result["data"]
        self.assertTrue(data["identity_preserved"])
        self.assertEqual(data["counts"]["changed"], 0)
        self.assertGreater(data["counts"]["unchanged"], 4)


if __name__ == "__main__":
    unittest.main()
