#!/usr/bin/env python3
"""Publish, verify or pull the Samsketch stock library using platform R2 as source of truth.

This intentionally reuses the existing model-inventory.ts and exporter build() logic in
agentsam-3d-studio. It does not modify that repository and it never writes D1.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from common import ARTIFACT_DIR, PLATFORM_ACCOUNT_ID, ensure_artifact_dir, r2_get, r2_put

STUDIO_ROOT = Path(os.environ.get("AGENTSAM_3D_STUDIO", str(Path.home() / "agentsam-3d-studio"))).resolve()
SHOWCASE_ROOT = STUDIO_ROOT / "experiences/showcase-studio-v1"
EXPORTER_PATH = SHOWCASE_ROOT / "scripts/export-inventory-to-cloud.py"
SOURCE_ROOT = STUDIO_ROOT / "out"
DEFAULT_BUCKET = "cad"
DEFAULT_APP = "samsketch"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_revision() -> dict[str, Any]:
    def git(*args: str) -> str | None:
        result = subprocess.run(["git", *args], cwd=STUDIO_ROOT, text=True, capture_output=True)
        return result.stdout.strip() if result.returncode == 0 else None
    status = git("status", "--short") or ""
    return {"repository": "agentsam-3d-studio", "commit": git("rev-parse", "HEAD"), "worktree_dirty": bool(status.strip())}


def load_exporter():
    if not EXPORTER_PATH.is_file():
        raise SystemExit(f"Existing studio exporter not found: {EXPORTER_PATH}")
    spec = importlib.util.spec_from_file_location("agentsam_existing_stock_exporter", EXPORTER_PATH)
    if not spec or not spec.loader:
        raise SystemExit("Could not load existing stock exporter")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_package(app_id: str, bucket: str, version: str, source_root: Path) -> tuple[dict[str, Any], dict[str, tuple[Any, str]], Path]:
    module = load_exporter()
    prefix = f"library/stock/{app_id}/{version}".strip("/")
    with tempfile.TemporaryDirectory(prefix="agentsam-stock-inventory-") as temporary:
        entries = module.load_inventory(Path(temporary))
        uploads, rows, missing = module.build(entries, source_root, app_id, prefix, bucket)
    if missing:
        raise SystemExit("Refusing to publish an incomplete stock library; missing:\n - " + "\n - ".join(sorted(set(missing))))

    objects: list[dict[str, Any]] = []
    total_bytes = 0
    for key, (source, content_type) in sorted(uploads.items()):
        if isinstance(source, bytes):
            size = len(source)
            digest = sha256_bytes(source)
        else:
            source = Path(source)
            if not source.is_file():
                raise SystemExit(f"Missing source file after inventory build: {source}")
            size = source.stat().st_size
            digest = sha256_file(source)
        total_bytes += size
        objects.append({"key": key, "content_type": content_type, "size_bytes": size, "sha256": digest})

    clean_entries = []
    for row in rows:
        clean_entries.append({key: row.get(key) for key in (
            "id", "sku", "app_id", "kind", "collection", "pack_slug", "pack_title", "category", "title", "tags", "specs",
            "payload_bucket", "payload_r2_key", "payload_sha256", "preview_r2_key", "source_refs",
            "status", "sort_order",
        )})

    manifest_key = f"{prefix}/manifest.json"
    manifest = {
        "schema": "agentsam.stock-library-manifest.v1",
        "app_id": app_id,
        "bucket": bucket,
        "cloudflare_account_id": PLATFORM_ACCOUNT_ID,
        "version": version,
        "prefix": prefix,
        "manifest_key": manifest_key,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": source_revision(),
        "inventory_source": "src/model-inventory.ts",
        "entry_count": len(clean_entries),
        "object_count": len(objects),
        "total_bytes": total_bytes,
        "entries": clean_entries,
        "objects": objects,
    }
    manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode()
    uploads[manifest_key] = (manifest_bytes, "application/json")

    local_manifest = ensure_artifact_dir() / "stock-library" / app_id / version / "manifest.json"
    local_manifest.parent.mkdir(parents=True, exist_ok=True)
    local_manifest.write_bytes(manifest_bytes)
    return manifest, uploads, local_manifest


def write_source(source: Any, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(source, bytes):
        destination.write_bytes(source)
    else:
        # The cache is a copy; R2 remains canonical.
        destination.write_bytes(Path(source).read_bytes())


def probe_manifest(bucket: str, key: str, temp: Path, replace: bool) -> None:
    result = r2_get(bucket, key, temp, check=False)
    if result.returncode == 0:
        if not replace:
            raise SystemExit(f"Refusing to overwrite existing version manifest {bucket}/{key}. Publish a new --version or explicitly pass --replace-existing-version.")
        return
    message = (result.stderr + "\n" + result.stdout).lower()
    if any(token in message for token in ("not found", "nosuchkey", "does not exist", "no such key")):
        return
    raise SystemExit("Could not safely determine whether the version already exists; refusing to publish. Wrangler/R2 auth or connectivity may be unavailable.\n" + message[-1200:])


def publish(bucket: str, manifest: dict[str, Any], uploads: dict[str, tuple[Any, str]], workers: int, replace: bool, verify_all: bool) -> None:
    manifest_key = manifest["manifest_key"]
    manifest_source = uploads.get(manifest_key)
    if manifest_source is None:
        raise SystemExit("Internal error: upload set has no manifest object")
    payload_uploads = [(key, value) for key, value in uploads.items() if key != manifest_key]
    with tempfile.TemporaryDirectory(prefix="agentsam-r2-publish-") as temporary:
        temp = Path(temporary)
        probe_manifest(bucket, manifest_key, temp / "existing-manifest.json", replace)

        def one(item: tuple[str, tuple[Any, str]]) -> tuple[str, str | None]:
            key, (source, content_type) = item
            staged = temp / "uploads" / hashlib.sha256(key.encode()).hexdigest()
            write_source(source, staged)
            try:
                r2_put(bucket, key, staged, content_type)
                return key, None
            except Exception as exc:  # return per-object failure without hiding other outcomes
                return key, str(exc)

        failures: list[tuple[str, str]] = []
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futures = [pool.submit(one, item) for item in payload_uploads]
            for index, future in enumerate(as_completed(futures), 1):
                key, error = future.result()
                if error:
                    failures.append((key, error))
                if index % 20 == 0 or index == len(payload_uploads):
                    print(f"uploaded/processed {index}/{len(payload_uploads)} payload objects")
        if failures:
            print("Failed uploads:")
            for key, error in failures:
                print(f" - {key}: {error[-700:]}")
            raise SystemExit(f"R2 publish incomplete: {len(failures)} objects failed. The manifest was not published.")

        # Publish the manifest last: consumers never see a complete catalog pointer before its objects exist.
        manifest_staged = temp / "manifest-to-publish.json"
        write_source(manifest_source[0], manifest_staged)
        r2_put(bucket, manifest_key, manifest_staged, manifest_source[1])
        remote_manifest = temp / "manifest-check.json"
        r2_get(bucket, manifest_key, remote_manifest)
        if remote_manifest.read_bytes() != manifest_staged.read_bytes():
            raise SystemExit("R2 manifest read-back did not match the published manifest")

        if verify_all:
            verify_manifest(bucket, manifest, temp / "verify")

    print(f"Published {len(payload_uploads) + 1} R2 objects to {bucket}/{manifest['prefix']}/")
    print("D1 was intentionally not changed. Register the manifest after the v2 catalog tables validate.")


def local_manifest_path(manifest: dict[str, Any]) -> Path:
    return ensure_artifact_dir() / "stock-library" / manifest["app_id"] / manifest["version"] / "manifest.json"


def save_local_manifest(manifest: dict[str, Any]) -> Path:
    path = local_manifest_path(manifest)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    return path


def load_remote_manifest(bucket: str, key: str) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="agentsam-r2-manifest-") as temporary:
        path = Path(temporary) / "manifest.json"
        r2_get(bucket, key, path)
        manifest = json.loads(path.read_text())
    if manifest.get("schema") != "agentsam.stock-library-manifest.v1":
        raise SystemExit(f"Unsupported R2 stock manifest schema: {manifest.get('schema')}")
    save_local_manifest(manifest)
    return manifest


def verify_manifest(bucket: str, manifest: dict[str, Any], workdir: Path) -> None:
    workdir.mkdir(parents=True, exist_ok=True)
    failures = []
    objects = manifest.get("objects", [])
    for index, item in enumerate(objects, 1):
        destination = workdir / hashlib.sha256(item["key"].encode()).hexdigest()
        try:
            r2_get(bucket, item["key"], destination)
            actual = sha256_file(destination)
            if actual != item["sha256"]:
                failures.append((item["key"], f"checksum mismatch expected={item['sha256']} actual={actual}"))
        except Exception as exc:
            failures.append((item["key"], str(exc)))
        if index % 20 == 0 or index == len(objects):
            print(f"verified {index}/{len(objects)}")
    if failures:
        for key, error in failures:
            print(f"FAIL {key}: {error[-500:]}")
        raise SystemExit(f"R2 verification failed for {len(failures)} objects")
    local_path = save_local_manifest(manifest)
    receipt = {
        "schema": "agentsam.stock-library-verification.v1",
        "manifest_key": manifest["manifest_key"],
        "manifest_sha256": sha256_file(local_path),
        "verified_objects": len(objects),
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "bucket": bucket,
    }
    receipt_path = local_path.parent / "verification.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"PASS: {len(objects)} objects match their manifest SHA-256 values")
    print(f"Verification receipt: {receipt_path}")


def pull_manifest(bucket: str, manifest: dict[str, Any], cache_dir: Path) -> None:
    root = cache_dir / bucket
    objects = manifest.get("objects", [])
    for index, item in enumerate(objects, 1):
        destination = root / item["key"]
        if destination.is_file() and sha256_file(destination) == item["sha256"]:
            pass
        else:
            r2_get(bucket, item["key"], destination)
            actual = sha256_file(destination)
            if actual != item["sha256"]:
                raise SystemExit(f"Checksum mismatch after pull: {item['key']}")
        if index % 20 == 0 or index == len(objects):
            print(f"pulled/verified {index}/{len(objects)}")
    manifest_path = root / manifest["manifest_key"]
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    save_local_manifest(manifest)
    receipt = {
        "schema": "agentsam.stock-library-verification.v1",
        "manifest_key": manifest["manifest_key"],
        "manifest_sha256": sha256_file(manifest_path),
        "verified_objects": len(objects),
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "bucket": bucket,
    }
    (local_manifest_path(manifest).parent / "verification.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Working copy refreshed: {root}")
    print("This is a cache/checkout. R2 remains the canonical stock source.")


def verify_existing_cad_templates() -> None:
    from common import d1_query
    rows = d1_query(
        "SELECT id,title,payload_bucket,payload_r2_key,payload_sha256 "
        "FROM studio_templates WHERE app_id='cad-creator' AND status='active' "
        "AND payload_bucket='cad' ORDER BY id"
    )
    if not rows:
        raise SystemExit("No active CAD Creator templates found in the current D1 catalog")
    failures = []
    with tempfile.TemporaryDirectory(prefix="agentsam-cad-preset-check-") as temporary:
        root = Path(temporary)
        for row in rows:
            path = root / hashlib.sha256(row["payload_r2_key"].encode()).hexdigest()
            try:
                r2_get("cad", row["payload_r2_key"], path)
                actual = sha256_file(path)
                if row.get("payload_sha256") and actual != row["payload_sha256"]:
                    failures.append((row["id"], "SHA-256 mismatch"))
            except Exception as exc:
                failures.append((row["id"], str(exc)))
    if failures:
        for item, error in failures:
            print(f"FAIL {item}: {error[-500:]}")
        raise SystemExit(f"{len(failures)} CAD template payloads failed verification")
    print(f"PASS: {len(rows)} CAD Creator templates fetched from platform R2 and matched D1 SHA-256")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("plan", "publish"):
        item = sub.add_parser(name)
        item.add_argument("--bucket", default=DEFAULT_BUCKET)
        item.add_argument("--app-id", default=DEFAULT_APP)
        item.add_argument("--version", default="v1")
        item.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
        item.add_argument("--workers", type=int, default=4)
        if name == "publish":
            item.add_argument("--apply", action="store_true")
            item.add_argument("--confirm-platform-stock", action="store_true")
            item.add_argument("--replace-existing-version", action="store_true")
            item.add_argument("--skip-verify", action="store_true", help="Skip full object read-back; catalog registration will remain blocked until verify is run")
    for name in ("verify", "pull"):
        item = sub.add_parser(name)
        item.add_argument("--bucket", default=DEFAULT_BUCKET)
        item.add_argument("--manifest-key", default=f"library/stock/{DEFAULT_APP}/v1/manifest.json")
        if name == "pull":
            item.add_argument("--cache-dir", type=Path, default=Path.home() / ".cache/agentsam/r2-stock")
    sub.add_parser("verify-cad-presets")
    args = parser.parse_args()

    if args.action in ("plan", "publish"):
        if args.bucket != "cad":
            raise SystemExit("This publisher is intentionally scoped to the first-party cad stock bucket.")
        if args.action == "publish" and (not args.apply or not args.confirm_platform_stock):
            raise SystemExit("Publishing requires both --apply and --confirm-platform-stock. Default is dry-run only.")
        prefix = f"library/stock/{args.app_id}/{args.version}"
        manifest, uploads, local_manifest = build_package(args.app_id, args.bucket, args.version, args.source_root.resolve())
        print(f"inventory: {manifest['entry_count']} entries")
        print(f"objects:   {manifest['object_count']} + manifest = {len(uploads)}")
        print(f"size:      {manifest['total_bytes'] / 1048576:.1f} MiB")
        print(f"target:    {args.bucket}/{prefix}/")
        print(f"manifest:  {local_manifest}")
        if args.action == "plan":
            print("DRY RUN: no R2 or D1 writes.")
            return 0
        publish(args.bucket, manifest, uploads, args.workers, args.replace_existing_version, not args.skip_verify)
        return 0

    if args.action == "verify":
        manifest = load_remote_manifest(args.bucket, args.manifest_key)
        with tempfile.TemporaryDirectory(prefix="agentsam-r2-verify-") as temporary:
            verify_manifest(args.bucket, manifest, Path(temporary))
        return 0

    if args.action == "pull":
        manifest = load_remote_manifest(args.bucket, args.manifest_key)
        pull_manifest(args.bucket, manifest, args.cache_dir.expanduser().resolve())
        return 0

    if args.action == "verify-cad-presets":
        verify_existing_cad_templates()
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
