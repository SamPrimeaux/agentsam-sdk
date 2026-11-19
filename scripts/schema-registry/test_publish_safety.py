"""Regression tests for non-destructive, index-last R2 schema publishing."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).with_name("publish_package_schemas.py")
SPEC = importlib.util.spec_from_file_location("schema_publisher", SCRIPT)
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)

LEGACY = "packages/iamscene/v1/scene.schema.json"
EXISTING = "contracts/source-types.v2.json"
NEW = "packages/example/v1/new.schema.json"
INDEX = "packages/manifest.v1.json"
LEGACY_HASH = "0a231b4d2121058ee9f6b3ce6ccc93a281834ecb4e188c562fc7b5d685a3c997"


def exercise(mode: str):
    with tempfile.TemporaryDirectory(prefix="schema-publish-test-") as td:
        root = pathlib.Path(td)
        source = {
            EXISTING: b"EXISTING_CONTRACT",
            NEW: b"NEW_SCHEMA",
            INDEX: json.dumps({"source": {"commit": "TEST_HEAD"}}).encode(),
        }
        objects = {}
        for key, data in source.items():
            path = root / key.replace("/", "_")
            path.write_bytes(data)
            objects[key] = (path, "application/json")

        remote = {LEGACY: b"LEGACY_OK", EXISTING: source[EXISTING], INDEX: b"PREVIOUS_INDEX"}
        if mode == "collision":
            remote[EXISTING] = b"INCOMPATIBLE"
        uploads = []

        def fake_hash(data: bytes) -> str:
            return LEGACY_HASH if data == b"LEGACY_OK" else hashlib.sha256(data).hexdigest()

        def fake_aws(args, account_id):
            if args[:2] == ["s3", "ls"]:
                prefix = args[2].split(f"s3://{publisher.BUCKET}/", 1)[1]
                return "".join(
                    f"2026-11-19 00:00:00 {len(body)} {key}\\n"
                    for key, body in remote.items() if key.startswith(prefix)
                )
            if args[:2] == ["s3", "cp"]:
                key = args[3].split(f"s3://{publisher.BUCKET}/", 1)[1]
                uploads.append(key)
                remote[key] = pathlib.Path(args[2]).read_bytes()
                return ""
            raise AssertionError(f"unexpected AWS request: {args[:2]}")

        def fake_fetch(key, account_id):
            if mode == "bad_readback" and key == NEW and key in remote:
                return b"CORRUPTED_READBACK"
            return remote[key]

        failure = None
        with (
            patch.object(publisher, "sha", side_effect=fake_hash),
            patch.object(publisher, "aws", side_effect=fake_aws),
            patch.object(publisher, "fetch_object", side_effect=fake_fetch),
            patch.object(publisher, "git_value", return_value="TEST_HEAD"),
        ):
            try:
                publisher.publish(objects, publisher.ACCOUNT_DEFAULT)
            except RuntimeError as exc:
                failure = exc
        return uploads, remote, source, failure


class PublicationSafetyTests(unittest.TestCase):
    def test_index_is_published_last_and_immutable_objects_are_skipped(self):
        uploads, remote, source, failure = exercise("success")
        self.assertIsNone(failure)
        self.assertEqual(uploads, [NEW, INDEX])
        self.assertEqual(remote[EXISTING], source[EXISTING])
        self.assertEqual(remote[LEGACY], b"LEGACY_OK")

    def test_existing_content_collision_prevents_all_writes(self):
        uploads, remote, source, failure = exercise("collision")
        self.assertIsInstance(failure, RuntimeError)
        self.assertIn("Immutable public schema collision", str(failure))
        self.assertEqual(uploads, [])
        self.assertEqual(remote[INDEX], b"PREVIOUS_INDEX")

    def test_bad_readback_does_not_expose_new_index(self):
        uploads, remote, source, failure = exercise("bad_readback")
        self.assertIsInstance(failure, RuntimeError)
        self.assertIn("readback checksum mismatch", str(failure))
        self.assertEqual(uploads, [NEW])
        self.assertEqual(remote[INDEX], b"PREVIOUS_INDEX")


if __name__ == "__main__":
    unittest.main()
