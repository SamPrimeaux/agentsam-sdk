"""Private, portable crawl evidence staging. Never publishes customer assets.

A bucket is a storage boundary, not an authorization system. Hosting services
must authorize account/project membership BEFORE calling these functions.
CLI account/project identifiers are labels, not an IAM permission grant.
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import shutil
from pathlib import Path

from .r2_upload import wrangler_put
from .wrangler_bucket import resolve_website_assets_bucket

_ACCOUNT = re.compile(r"au_[a-zA-Z0-9_-]{4,128}\Z")
_PROJECT = re.compile(r"proj_[a-zA-Z0-9_-]{3,128}\Z")
_RUN = re.compile(r"scrp_[0-9a-f]{24}\Z")
_BUCKET = re.compile(r"[a-z0-9][a-z0-9-]{1,62}[a-z0-9]\Z")


def evidence_prefix(account_id: str, project_id: str, run_id: str) -> str:
    """Validate caller labels and return an immutable per-run object namespace."""
    if not _ACCOUNT.fullmatch(account_id):
        raise ValueError("account_id must be a valid au_ identifier")
    if not _PROJECT.fullmatch(project_id):
        raise ValueError("project_id must be a valid proj_ identifier")
    if not _RUN.fullmatch(run_id):
        raise ValueError("run_id must be a canonical scrp_ receipt ID")
    return f"v1/accounts/{account_id}/projects/{project_id}/runs/{run_id}"


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _record(root: Path, relative: str) -> dict:
    src = root / relative
    return {
        "key": relative,
        "sha256": "sha256:" + _digest(src),
        "bytes": src.stat().st_size,
        "content_type": mimetypes.guess_type(relative)[0] or "application/octet-stream",
    }


def stage_evidence(
    crawl_result, receipt: dict, *, account_id: str, project_id: str,
    archive_dir: Path,
) -> dict:
    """Stage a self-contained, immutable run with hashes and manifest-last semantics.

    Never overwrites an existing run; receipts and page/image content remain
    private until an explicit separately authorized upload/promotion.
    """
    prefix = evidence_prefix(account_id, project_id, receipt["run_id"])
    root = Path(archive_dir).resolve() / prefix
    if root.exists():
        raise FileExistsError(f"crawl evidence already exists, refusing overwrite: {root}")
    root.mkdir(parents=True)
    try:
        records = []
        receipt_path = root / "receipt.json"
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        records.append(_record(root, "receipt.json"))
        for index, page in enumerate(sorted(crawl_result.pages, key=lambda p: p.url), 1):
            source = Path(page.json_path)
            if not source.is_file():
                raise FileNotFoundError(f"page JSON missing: {source}")
            relative = f"pages/{index:05d}.json"
            target = root / relative
            target.parent.mkdir(exist_ok=True)
            shutil.copyfile(source, target)
            entry = _record(root, relative)
            entry["kind"] = "page"
            entry["source_url"] = page.url
            records.append(entry)
        stored_images = set()
        for image in sorted(crawl_result.images, key=lambda i: i.url):
            if not image.ok or not image.optimized_path:
                continue
            source = Path(image.optimized_path)
            if not source.is_file():
                raise FileNotFoundError(f"image missing: {source}")
            digest = _digest(source)
            suffix = source.suffix.lower()
            if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
                raise ValueError("image extension is unsafe")
            relative = f"assets/{digest}{suffix}"
            if relative in stored_images:
                continue
            stored_images.add(relative)
            target = root / relative
            target.parent.mkdir(exist_ok=True)
            shutil.copyfile(source, target)
            entry = _record(root, relative)
            entry["kind"] = "image"
            entry["source_url"] = image.url
            entry["section"] = getattr(image, "section", None)
            records.append(entry)
        # Compatibility adapter emits the SAME site.index graph understood by
        # Knowledge; it does not create a second indexing engine.
        compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        digest_json = lambda value: hashlib.sha256(compact(value).encode("utf-8")).hexdigest()
        resources = []
        for page in sorted(crawl_result.pages, key=lambda p: p.url):
            payload = json.loads(Path(page.json_path).read_text(encoding="utf-8"))
            blocks = payload.get("content") or []
            resources.append({
                "id": "page:" + hashlib.sha256(page.url.encode("utf-8")).hexdigest()[:24],
                "url": page.url,
                "title": getattr(page, "title", None) or payload.get("title") or "",
                "meta": payload.get("meta") or {},
                "content_hash": "sha256:" + digest_json(blocks),
                "blocks": blocks,
                "image_count": int(getattr(page, "image_count", 0)),
            })
        assets = []
        for image in sorted(crawl_result.images, key=lambda i: i.url):
            if image.ok and image.optimized_path:
                assets.append({
                    "id": "asset:" + hashlib.sha256(image.url.encode("utf-8")).hexdigest()[:24],
                    "url": image.url,
                    "alt": "",
                })
        edges = []  # No canonical page/link relationships in the Python adapter yet.
        graph = {
            "schema": "agentsam.site.index.v1",
            "resources": resources,
            "assets": assets,
            "edges": edges,
            "counts": {"pages": len(resources), "assets": len(assets), "edges": 0},
            "content_hash": "sha256:" + digest_json({"resources": resources, "assets": assets, "edges": edges}),
        }
        (root / "index.json").write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        records.append(_record(root, "index.json"))
        manifest = {
            "schema_version": 1,
            "kind": "agentsam.crawl-evidence.v1",
            "visibility": "private",
            "account_id": account_id,
            "project_id": project_id,
            "run_id": receipt["run_id"],
            "prefix": prefix,
            "receipt_status": receipt["status"],
            "crawl_content_hash": receipt.get("content_hash"),
            "objects": records,
        }
        (root / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return {"root": str(root), "prefix": prefix, "manifest": manifest}
    except Exception:
        shutil.rmtree(root)
        raise


def verify_evidence(archive_root: Path) -> dict:
    """Verify integrity before uploading; fail on any changed/missing file."""
    root = Path(archive_root).resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("kind") != "agentsam.crawl-evidence.v1":
        raise ValueError("not an AgentSam crawl-evidence manifest")
    if manifest.get("prefix") != evidence_prefix(
        manifest["account_id"], manifest["project_id"], manifest["run_id"]
    ):
        raise ValueError("archive identity/prefix mismatch")
    keys = set()
    for item in manifest["objects"]:
        key = item["key"]
        if not isinstance(key, str) or key in keys or key.startswith("/") or "\\" in key:
            raise ValueError("duplicate or unsafe evidence object key")
        parts = Path(key).parts
        if not parts or any(part in (".", "..") for part in parts):
            raise ValueError("unsafe evidence object path")
        keys.add(key)
        path = (root / key).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("evidence object missing or escapes archive root")
        if path.stat().st_size != item["bytes"] or "sha256:" + _digest(path) != item["sha256"]:
            raise ValueError(f"evidence checksum mismatch: {key}")
    if "receipt.json" not in keys:
        raise ValueError("archive requires canonical receipt")
    receipt = json.loads((root / "receipt.json").read_text(encoding="utf-8"))
    if receipt.get("run_id") != manifest["run_id"]:
        raise ValueError("receipt/run mismatch")
    return manifest


def upload_evidence(
    archive_root: Path, *, bucket: str, repo_root: Path,
    wrangler_config: str | None = None,
) -> dict:
    """Explicit remote upload; manifest is uploaded last as completion marker."""
    if not _BUCKET.fullmatch(bucket):
        raise ValueError("invalid R2 bucket name")
    root = Path(archive_root).resolve()
    if not Path(repo_root).is_dir():
        raise ValueError("repo_root must be a local Wrangler workspace")
    try:
        delivery_bucket = resolve_website_assets_bucket(Path(repo_root), wrangler_config=wrangler_config)
    except (RuntimeError, FileNotFoundError):
        delivery_bucket = None
    if delivery_bucket and bucket == delivery_bucket:
        raise ValueError("evidence bucket must not equal the site's WEBSITE_ASSETS delivery bucket")
    manifest = verify_evidence(root)
    prefix = manifest["prefix"]
    count = 0
    for item in manifest["objects"]:
        wrangler_put(Path(repo_root), bucket, f"{prefix}/{item['key']}",
                     root / item["key"], item["content_type"], "private, no-store",
                     wrangler_config=wrangler_config)
        count += 1
    # Publish last so a consumer never treats a partially uploaded run as ready.
    wrangler_put(Path(repo_root), bucket, f"{prefix}/manifest.json",
                 root / "manifest.json", "application/json", "private, no-store",
                 wrangler_config=wrangler_config)
    return {"bucket": bucket, "prefix": prefix, "uploaded": count + 1,
            "manifest_key": f"{prefix}/manifest.json"}
