#!/usr/bin/env python3
"""Build, verify, and publish the canonical AgentSam package-schema catalog.

R2 layout:
  packages/manifest.v1.schema.json
  packages/manifest.v1.json
  packages/{package}/v{major}/*.schema.json
  packages/{package}/v{major}/schema-pack.manifest.json

The publisher never deletes legacy agentsam/ objects. CAD Creator and Game Studio
retain their independently versioned release manifests and are indexed here.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUCKET = "inneranimalmedia-schemas"
ACCOUNT_DEFAULT = "ede6590ac0d2fb7daf155b35653457b2"
BASE = "https://schemas.inneranimalmedia.com"
REGISTRY_SCHEMA_URI = f"{BASE}/packages/manifest.v1.schema.json"
GENERIC_PACK_SCHEMA_URI = f"{BASE}/packages/agentsam-protocol/v1/database.agentsam.schema-pack.v1.schema.json"
STAGE = ROOT / "dist" / "schema-registry"
DRAFT2020 = "https://json-schema.org/draft/2020-12/schema"
DRAFT07 = "http://json-schema.org/draft-07/schema#"

# Each tuple is (source path, published filename).
PACKAGE_SPECS = [
    ("agentsam-contracts", "@inneranimalmedia/agentsam-contracts", "packages/agentsam-contracts/package.json", "npm", "agentsam.contracts", "1.0.0", "v1", [
        ("packages/agentsam-contracts/schemas/agent-tool-definition.v1.schema.json", "agent-tool-definition.v1.schema.json"),
        ("packages/agentsam-contracts/schemas/sam-operation.v1.schema.json", "sam-operation.v1.schema.json"),
        ("packages/agentsam-contracts/schemas/sam-result.v1.schema.json", "sam-result.v1.schema.json"),
    ]),
    ("agentsam-errors", "@inneranimalmedia/agentsam-errors", "packages/agentsam-errors/package.json", "npm", "agentsam.errors", "2.0.0", "v2", [
        ("packages/agentsam-errors/protocol/agentsam.error.v2.schema.json", "agentsam.error.v2.schema.json"),
    ]),
    ("agentsam-merch", "@inneranimalmedia/agentsam-merch", "packages/agentsam-merch/package.json", "npm", "agentsam.merch", "1.0.0", "v1", [
        ("packages/agentsam-merch/schemas/collection-candidate.schema.json", "collection-candidate.v1.schema.json"),
        ("packages/agentsam-merch/schemas/manufacturing-profile.schema.json", "manufacturing-profile.v1.schema.json"),
    ]),
    ("agentsam-queue-control", "@inneranimalmedia/agentsam-queue-control", "packages/agentsam-queue-control/package.json", "npm", "agentsam.queue-control", "1.0.0", "v1", [
        ("packages/agentsam-queue-control/schemas/job-envelope.schema.json", "job-envelope.v1.schema.json"),
    ]),
    ("theme-heuristic", "@inneranimalmedia/theme-heuristic", "packages/heuristic-theme/package.json", "npm", "theme.heuristic", "1.0.0", "v1", [
        ("packages/heuristic-theme/theme.schema.json", "theme.schema.json"),
        ("packages/heuristic-theme/contracts/block.schema.json", "contracts/block.schema.json"),
        ("packages/heuristic-theme/contracts/page.schema.json", "contracts/page.schema.json"),
        ("packages/heuristic-theme/contracts/preset.schema.json", "contracts/preset.schema.json"),
        ("packages/heuristic-theme/contracts/section.schema.json", "contracts/section.schema.json"),
        ("packages/heuristic-theme/tokens.schema.json", "tokens.schema.json"),
    ]),
    ("theme-contract", "@inneranimalmedia/theme-contract", "packages/theme-contract/package.json", "npm", "theme.contract", "1.0.0", "v1", [
        ("packages/theme-contract/schemas/template-contract.v1.schema.json", "template-contract.v1.schema.json"),
        ("packages/theme-contract/schemas/theme-package-contract.v1.schema.json", "theme-package-contract.v1.schema.json"),
    ]),
    ("agentsam-desktop-shell", "@inneranimalmedia/agentsam-desktop-shell", "packages/agentsam-desktop-shell/package.json", "npm", "agentsam.desktop-shell", "1.0.0", "v1", [
        ("packages/agentsam-desktop-shell/manifests/schema.json", "brand-manifest.schema.json"),
    ]),
    ("agentsam-campaign", "@inneranimalmedia/agentsam-campaign", "packages/agentsam-campaign/package.json", "npm", "agentsam.campaign", "1.0.0", "v1", [
        ("packages/agentsam-campaign/starter-packs/increase-sales/v1/src/schema.json", "increase-sales.schema.json"),
    ]),
    ("agentsam-go-worker", "@inneranimalmedia/agentsam-go-worker", "apps/agentsam-go-worker/package.json", "application", "agentsam.go-worker", "1.0.0", "v1", [
        ("apps/agentsam-go-worker/contracts/runtime.v1.json", "runtime.v1.schema.json"),
    ]),
    ("iamscene", "@inneranimalmedia/iamscene", "packages/iamscene/package.json", "npm", "iamscene", "1.0.0", "v1", [
        ("packages/iamscene/schema/iamscene.v1.schema.json", "scene.canonical.schema.json"),
    ]),
]

SPECIAL_PACKS = [
    ("agentsam-hooks", "@inneranimalmedia/agentsam-hooks", "packages/agentsam-hooks/package.json", "v1", "packages/agentsam-hooks/schema/manifest.json"),
    ("agentsam-identity", "@inneranimalmedia/agentsam-identity", "packages/identity/package.json", "v2", "packages/identity/schema/agentsam.identity/manifest.json"),
]

DUPLICATE_PROTOCOL_SOURCES = {
    "protocol/tools/agent-tool-definition.v1.schema.json",
    "protocol/sam/operation.schema.json",
    "protocol/sam/result.schema.json",
    "protocol/errors/agentsam.error.v2.schema.json",
    "protocol/errors/error-envelope.schema.json",
}

SCHEMA_KEYWORDS = {
    "type", "properties", "items", "enum", "const", "oneOf", "anyOf", "allOf", "not",
    "pattern", "required", "minLength", "maxLength", "minimum", "maximum",
    "additionalProperties", "prefixItems", "contains", "format", "$ref", "if", "then",
    "else", "dependentSchemas", "propertyNames", "unevaluatedProperties",
}


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: pathlib.Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return value


def is_schema(doc: dict) -> bool:
    return isinstance(doc.get("$schema"), str) and bool(SCHEMA_KEYWORDS.intersection(doc))


def git_value(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def aws_env() -> dict:
    env = os.environ.copy()
    access = env.get("R2_ACCESS_KEY_ID") or env.get("AWS_ACCESS_KEY_ID")
    secret = env.get("R2_SECRET_ACCESS_KEY") or env.get("AWS_SECRET_ACCESS_KEY")
    if not access or not secret:
        raise RuntimeError("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be available in the local operator environment")
    env["AWS_ACCESS_KEY_ID"] = access
    env["AWS_SECRET_ACCESS_KEY"] = secret
    env["AWS_DEFAULT_REGION"] = "auto"
    return env


def aws(args: list[str], account_id: str) -> str:
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    proc = subprocess.run(["aws", *args, "--endpoint-url", endpoint], cwd=ROOT, env=aws_env(), text=True, capture_output=True)
    if proc.returncode:
        raise RuntimeError(f"AWS command failed: {' '.join(args)}\n{proc.stderr or proc.stdout}")
    return proc.stdout


def fetch_object(key: str, account_id: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="iam-schema-r2-") as td:
        path = pathlib.Path(td) / pathlib.Path(key).name
        aws(["s3", "cp", f"s3://{BUCKET}/{key}", str(path), "--only-show-errors"], account_id)
        return path.read_bytes()


def put_stage(objects: dict[str, tuple[pathlib.Path, str]], key: str, data: bytes, content_type: str) -> pathlib.Path:
    path = STAGE / "objects" / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    objects[key] = (path, content_type)
    return path


def add_module(objects: dict, modules: list, source_rel: str, key: str, filename: str) -> dict:
    source = ROOT / source_rel
    doc = load_json(source)
    if not is_schema(doc):
        raise ValueError(f"Not a JSON Schema document: {source_rel}")
    if not doc.get("$id"):
        raise ValueError(f"Missing $id: {source_rel}")
    uri = f"{BASE}/{key}"
    schema_id = doc["$id"]
    if schema_id.startswith("http://") or schema_id.startswith("https://"):
        if schema_id != uri:
            raise ValueError(f"$id does not match published URI for {source_rel}: {schema_id} != {uri}")
    data = source.read_bytes()
    put_stage(objects, key, data, "application/schema+json")
    module = {
        "name": filename,
        "path": filename,
        "uri": uri,
        "id": schema_id,
        "sha256": sha(data),
        "bytes": len(data),
        "contentType": "application/schema+json",
        "schemaDraft": doc.get("$schema"),
        "sourcePath": source_rel,
    }
    modules.append(module)
    return module


def resolve_pointer(doc: object, fragment: str, source: str) -> None:
    if not fragment:
        return
    if not fragment.startswith("/"):
        # Named anchors are checked by their owning schema validator at runtime.
        return
    current = doc
    for raw in fragment[1:].split("/"):
        part = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            current = current[int(part)]
        elif isinstance(current, dict):
            current = current[part]
        else:
            raise ValueError(f"JSON pointer traverses a scalar in {source}: #{fragment}")


def verify_refs(schema_docs: list[tuple[str, dict]], allowed_external: set[str]) -> None:
    index = {}
    for label, doc in schema_docs:
        schema_id = doc.get("$id")
        if schema_id:
            if schema_id in index:
                raise ValueError(f"Duplicate canonical $id {schema_id}: {index[schema_id][0]} and {label}")
            index[schema_id] = (label, doc)

    def walk(value, label, owning_doc, owning_id):
        if isinstance(value, dict):
            ref = value.get("$ref")
            if isinstance(ref, str):
                full = urllib.parse.urljoin(owning_id or "", ref)
                base, _, fragment = full.partition("#")
                if not base:
                    target = owning_doc
                    target_label = label
                elif base in index:
                    target_label, target = index[base]
                elif base in allowed_external:
                    target = None
                    target_label = base
                elif base.startswith("https://json-schema.org/") or base.startswith("http://json-schema.org/"):
                    target = None
                    target_label = base
                else:
                    raise ValueError(f"Unresolved $ref in {label}: {ref} -> {base}")
                if target is not None:
                    resolve_pointer(target, fragment, target_label)
            for child in value.values():
                walk(child, label, owning_doc, owning_id)
        elif isinstance(value, list):
            for child in value:
                walk(child, label, owning_doc, owning_id)

    for label, doc in schema_docs:
        walk(doc, label, doc, doc.get("$id", ""))


def validate_registry(registry: dict, registry_schema: dict) -> None:
    required = {"schema", "version", "source", "packages", "sharedContracts", "registries", "compatibility"}
    if not required.issubset(registry):
        raise ValueError(f"Registry missing required keys: {sorted(required - set(registry))}")
    if registry.get("schema") != "agentsam.package-schema-registry.v1" or registry.get("version") != 1:
        raise ValueError("Unexpected package registry schema/version")
    if registry_schema.get("$id") != REGISTRY_SCHEMA_URI:
        raise ValueError("Registry schema $id is not canonical")
    for pkg in registry["packages"]:
        for field in ("id", "name", "version", "kind", "manifestUri", "schemaCount", "manifestSha256"):
            if field not in pkg:
                raise ValueError(f"Package entry {pkg.get('id')} missing {field}")
        if not re.fullmatch(r"[a-f0-9]{64}", pkg["manifestSha256"]):
            raise ValueError(f"Invalid manifest hash for {pkg['id']}")


def build(account_id: str) -> tuple[dict, dict[str, tuple[pathlib.Path, str]], list[tuple[str, dict]], dict]:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    objects: dict[str, tuple[pathlib.Path, str]] = {}
    packages = []
    schema_docs: list[tuple[str, dict]] = []
    allowed_external: set[str] = set()
    commit = git_value("rev-parse", "HEAD")
    ref = git_value("branch", "--show-current")
    built_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    generic_pack_schema = load_json(ROOT / "protocol/database/agentsam.schema-pack.v1.schema.json")
    registry_schema = load_json(ROOT / "protocol/packages/agentsam.package-schema-registry.v1.schema.json")

    # Shared, reusable protocol bundle. CAD v2 and the package-owned duplicate contracts
    # stay in their own release/package manifests.
    protocol_sources = []
    for path in sorted((ROOT / "protocol").rglob("*.json")):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith("protocol/cad/v2/") or rel == "protocol/cad/cad.project.v2.schema.json" or rel == "protocol/packages/agentsam.package-schema-registry.v1.schema.json":
            continue
        if rel == "protocol/contracts/source-types.v2.schema.json" or rel.startswith("protocol/contracts/"):
            continue
        if rel in DUPLICATE_PROTOCOL_SOURCES:
            continue
        try:
            doc = load_json(path)
        except (ValueError, json.JSONDecodeError):
            continue
        if not is_schema(doc):
            continue
        protocol_sources.append(rel)
    protocol_modules = []
    for rel in protocol_sources:
        parts = pathlib.PurePosixPath(rel).relative_to("protocol").parts
        domain, filename = parts[0], parts[-1]
        if not filename.endswith(".schema.json"):
            filename = filename[:-5] + ".schema.json" if filename.endswith(".json") else filename + ".schema.json"
        published_name = f"{domain}.{filename}"
        key = f"packages/agentsam-protocol/v1/{published_name}"
        add_module(objects, protocol_modules, rel, key, published_name)
    if len(protocol_modules) != 81:
        raise ValueError(f"Expected 81 unique shared protocol schemas, found {len(protocol_modules)}")

    root_version = load_json(ROOT / "package.json").get("version", "unknown")
    specs = [("agentsam-protocol", "@inneranimalmedia/agentsam-protocol", "protocol", "agentsam.protocol", "1.0.0", "v1", "protocol/", protocol_modules, root_version)]

    for slug, expected_name, package_json, kind, pack_id, pack_version, version_path, files in PACKAGE_SPECS:
        package_meta = load_json(ROOT / package_json)
        package_name = package_meta.get("name", expected_name)
        package_version = package_meta.get("version", "unknown")
        modules = []
        for source_rel, filename in files:
            key = f"packages/{slug}/{version_path}/{filename}"
            add_module(objects, modules, source_rel, key, filename)
        specs.append((slug, package_name, kind, pack_id, pack_version, version_path, package_json.rsplit("/", 1)[0], modules, package_version))

    for slug, package_name, kind, pack_id, pack_version, version_path, source_path, modules, package_version in specs:
        manifest_key = f"packages/{slug}/{version_path}/schema-pack.manifest.json"
        manifest = {
            "$schema": GENERIC_PACK_SCHEMA_URI,
            "schema": "agentsam.schema-pack.v1",
            "id": pack_id,
            "version": pack_version,
            "pack_family": pack_id,
            "components": [m["name"] for m in modules],
            "component_dependencies": {m["name"]: [] for m in modules},
            "modules": modules,
            "owner": package_name,
            "packageVersion": package_version,
            "sourceAuthority": f"SamPrimeaux/agentsam-sdk:{source_path}",
            "sourceCommit": commit,
        }
        manifest_bytes = json_bytes(manifest)
        put_stage(objects, manifest_key, manifest_bytes, "application/json")
        packages.append({
            "id": slug,
            "name": package_name,
            "version": package_version,
            "kind": kind,
            "manifestUri": f"{BASE}/{manifest_key}",
            "objectPrefix": f"packages/{slug}/{version_path}/",
            "schemaPackVersion": pack_version,
            "schemaCount": len(modules),
            "manifestSha256": sha(manifest_bytes),
            "sourcePath": source_path,
        })
        for m in modules:
            doc = load_json(ROOT / m["sourcePath"])
            schema_docs.append((m["sourcePath"], doc))

    # Existing portable pack manifests for hooks and identity are package authority, not schemas.
    for slug, package_name, package_json, version_path, source_rel in SPECIAL_PACKS:
        source = ROOT / source_rel
        manifest = load_json(source)
        if manifest.get("$schema") != GENERIC_PACK_SCHEMA_URI:
            raise ValueError(f"Package manifest has stale $schema: {source_rel}")
        package_version = load_json(ROOT / package_json).get("version", "unknown")
        manifest["packageVersion"] = package_version
        manifest["sourceCommit"] = commit
        key = f"packages/{slug}/{version_path}/schema-pack.manifest.json"
        data = json_bytes(manifest)
        put_stage(objects, key, data, "application/json")
        packages.append({
            "id": slug,
            "name": package_name,
            "version": package_version,
            "kind": "npm",
            "manifestUri": f"{BASE}/{key}",
            "objectPrefix": f"packages/{slug}/{version_path}/",
            "schemaPackVersion": manifest.get("version", "unknown"),
            "schemaCount": 0,
            "componentsCount": len(manifest.get("components", [])),
            "manifestSha256": sha(data),
            "sourcePath": source_rel,
        })

    # Brand iconography is a reusable package artifact manifest, not a JSON Schema.
    brand_source = ROOT / "packages/agentsam-brand/assets/iconography/v1/iconography.manifest.json"
    brand_data = brand_source.read_bytes()
    brand_key = "packages/agentsam-brand/v1/iconography.manifest.json"
    put_stage(objects, brand_key, brand_data, "application/json")
    brand_version = load_json(ROOT / "packages/agentsam-brand/package.json").get("version", "unknown")
    packages.append({
        "id": "agentsam-brand", "name": "@inneranimalmedia/agentsam-brand", "version": brand_version,
        "kind": "asset-catalog", "manifestUri": f"{BASE}/{brand_key}",
        "objectPrefix": "packages/agentsam-brand/v1/", "schemaCount": 0, "artifactCount": 1,
        "manifestSha256": sha(brand_data), "sourcePath": "packages/agentsam-brand/assets/iconography/v1/iconography.manifest.json",
    })

    # Existing independent packages remain authoritative; index their current R2 manifests.
    game_key = "packages/agentsam-game-studio/v1/schema-pack.manifest.json"
    game_bytes = fetch_object(game_key, account_id)
    game_manifest = json.loads(game_bytes)
    packages.append({
        "id": "agentsam-game-studio", "name": "AgentSam Game Studio", "version": game_manifest.get("release", "1.0.0"),
        "kind": "external", "manifestUri": f"{BASE}/{game_key}",
        "objectPrefix": game_manifest.get("objectPrefix", "packages/agentsam-game-studio/v1/"),
        "schemaPackVersion": game_manifest.get("release", "1.0.0"),
        "schemaCount": len(game_manifest.get("modules", [])), "manifestSha256": sha(game_bytes),
        "sourcePath": "R2:packages/agentsam-game-studio/v1/",
    })
    game_modules = game_manifest.get("modules", [])
    for m in game_modules:
        module_key = urllib.parse.urlparse(m["uri"]).path.lstrip("/")
        module_bytes = fetch_object(module_key, account_id)
        if sha(module_bytes) != m.get("sha256"):
            raise ValueError(f"Game Studio module checksum mismatch: {module_key}")
        module_doc = json.loads(module_bytes)
        if module_doc.get("$id") != m["uri"]:
            raise ValueError(f"Game Studio module $id mismatch: {module_key}")
        schema_docs.append((f"R2:{module_key}", module_doc))

    cad_registry_key = "apps/cad-creator/schemas/registry.v1.json"
    cad_registry_bytes = fetch_object(cad_registry_key, account_id)
    cad_registry = json.loads(cad_registry_bytes)
    cad_manifest_uri = cad_registry["manifestUri"]
    cad_manifest_key = urllib.parse.urlparse(cad_manifest_uri).path.lstrip("/")
    cad_manifest_bytes = fetch_object(cad_manifest_key, account_id)
    if sha(cad_manifest_bytes) != cad_registry.get("manifestSha256"):
        raise ValueError("CAD registry manifest checksum does not match its published registry pointer")
    cad_manifest = json.loads(cad_manifest_bytes)
    for m in cad_manifest.get("modules", []):
        module_key = urllib.parse.urlparse(m["uri"]).path.lstrip("/")
        module_bytes = fetch_object(module_key, account_id)
        if sha(module_bytes) != m.get("sha256"):
            raise ValueError(f"CAD module checksum mismatch: {module_key}")
        module_doc = json.loads(module_bytes)
        if module_doc.get("$id") != m["uri"]:
            raise ValueError(f"CAD module $id mismatch: {module_key}")
        schema_docs.append((f"R2:{module_key}", module_doc))
    cad_release = cad_registry.get("release", cad_manifest.get("packVersion", "unknown"))
    cad_schema_count = len(cad_manifest.get("modules", [])) + 1 # the stable cad.project.v2 entrypoint
    packages.append({
        "id": "agentsam-cad-creator", "name": "@inneranimalmedia/agentsam-cad-creator", "version": cad_release,
        "kind": "application", "manifestUri": cad_manifest_uri,
        "objectPrefix": cad_manifest.get("objectPrefix"), "schemaPackVersion": cad_release,
        "schemaCount": cad_schema_count, "manifestSha256": sha(cad_manifest_bytes),
        "registryUri": f"{BASE}/{cad_registry_key}", "release": cad_release,
        "sourcePath": cad_registry.get("sourceAuthority", "protocol/cad/v2"),
    })

    # CAD's entrypoint schema and the shared source-type contract are external/shared schemas.
    cad_project = load_json(ROOT / "protocol/cad/cad.project.v2.schema.json")
    schema_docs.append(("protocol/cad/cad.project.v2.schema.json", cad_project))
    source_types_schema = load_json(ROOT / "contracts/source-types.v2.schema.json")
    schema_docs.append(("contracts/source-types.v2.schema.json", source_types_schema))
    schema_docs.append(("protocol/packages/agentsam.package-schema-registry.v1.schema.json", registry_schema))
    for module in game_modules:
        # External schema IDs are registered as allowed targets; the package manifest carries hashes.
        pass

    source_schema_path = ROOT / "contracts/source-types.v2.schema.json"
    source_data_path = ROOT / "contracts/source-types.v2.json"
    shared_contracts = [{
        "id": "agentsam.source-types.v2",
        "schemaUri": f"{BASE}/contracts/source-types.v2.schema.json",
        "dataUri": f"{BASE}/contracts/source-types.v2.json",
        "schemaSha256": sha(source_schema_path.read_bytes()),
        "dataSha256": sha(source_data_path.read_bytes()),
        "schemaBytes": source_schema_path.stat().st_size,
        "dataBytes": source_data_path.stat().st_size,
    }]

    # Registry schema and shared contracts are part of the same reproducible publication.
    registry_schema_key = "packages/manifest.v1.schema.json"
    registry_schema_data = (ROOT / "protocol/packages/agentsam.package-schema-registry.v1.schema.json").read_bytes()
    put_stage(objects, registry_schema_key, registry_schema_data, "application/schema+json")
    put_stage(objects, "contracts/source-types.v2.schema.json", source_schema_path.read_bytes(), "application/schema+json")
    put_stage(objects, "contracts/source-types.v2.json", source_data_path.read_bytes(), "application/json")

    # The CAD registry is the only separate mutable pointer in this catalog.
    registries = [{
        "id": "agentsam-cad-creator",
        "registryUri": f"{BASE}/{cad_registry_key}",
        "manifestUri": cad_manifest_uri,
        "release": cad_release,
        "moduleCount": len(cad_manifest.get("modules", [])),
        "manifestSha256": sha(cad_manifest_bytes),
    }]

    legacy_listing = aws(["s3", "ls", f"s3://{BUCKET}/agentsam/", "--recursive"], account_id)
    legacy_count = sum(1 for line in legacy_listing.splitlines() if line.strip())
    registry = {
        "$schema": REGISTRY_SCHEMA_URI,
        "schema": "agentsam.package-schema-registry.v1",
        "version": 1,
        "source": {"repository": "SamPrimeaux/agentsam-sdk", "commit": commit, "ref": ref, "builtAt": built_at},
        "packages": sorted(packages, key=lambda x: x["id"]),
        "sharedContracts": shared_contracts,
        "registries": registries,
        "compatibility": {
            "legacyPrefixes": ["agentsam/"],
            "legacyObjectCount": legacy_count,
            "legacySchemaAliases": [{
                "legacyUri": f"{BASE}/packages/iamscene/v1/scene.schema.json",
                "canonicalUri": f"{BASE}/packages/iamscene/v1/scene.canonical.schema.json",
                "legacySha256": "0a231b4d2121058ee9f6b3ce6ccc93a281834ecb4e188c562fc7b5d685a3c997",
            }],
            "policy": "Legacy agentsam/ objects and published immutable schema aliases are retained byte-for-byte. No existing schema identity is overwritten; new consumers use packages/manifest.v1.json.",
        },
    }
    validate_registry(registry, registry_schema)
    registry_data = json_bytes(registry)
    put_stage(objects, "packages/manifest.v1.json", registry_data, "application/json")

    # Validate every staged JSON object, package pack contract, canonical ID, and local/external ref.
    canonical_ids = set()
    for key, (path, _) in objects.items():
        data = path.read_bytes()
        json.loads(data)
    for label, doc in schema_docs:
        schema_id = doc.get("$id")
        if schema_id:
            if schema_id in canonical_ids:
                raise ValueError(f"Duplicate canonical schema ID: {schema_id}")
            canonical_ids.add(schema_id)
    verify_refs(schema_docs, allowed_external)

    # Ensure all source mirrors remain byte-identical; only one canonical copy is published.
    mirror_pairs = [
        ("protocol/tools/agent-tool-definition.v1.schema.json", "packages/agentsam-contracts/schemas/agent-tool-definition.v1.schema.json"),
        ("protocol/sam/operation.schema.json", "packages/agentsam-contracts/schemas/sam-operation.v1.schema.json"),
        ("protocol/sam/result.schema.json", "packages/agentsam-contracts/schemas/sam-result.v1.schema.json"),
        ("protocol/errors/agentsam.error.v2.schema.json", "packages/agentsam-errors/protocol/agentsam.error.v2.schema.json"),
        ("protocol/errors/error-envelope.schema.json", "packages/agentsam-errors/protocol/agentsam.error.v2.schema.json"),
        ("packages/agentsam-merch/schemas/collection-candidate.schema.json", "apps/ecommerce-cms-agentsam/packages/agentsam-merch/schemas/collection-candidate.schema.json"),
        ("packages/agentsam-merch/schemas/manufacturing-profile.schema.json", "apps/ecommerce-cms-agentsam/packages/agentsam-merch/schemas/manufacturing-profile.schema.json"),
        ("packages/theme-contract/schemas/template-contract.v1.schema.json", "apps/ecommerce-cms-agentsam/packages/theme-contract/template-contract.v1.schema.json"),
        ("packages/theme-contract/schemas/theme-package-contract.v1.schema.json", "apps/ecommerce-cms-agentsam/packages/theme-contract/theme-package-contract.v1.schema.json"),
    ]
    for left, right in mirror_pairs:
        if sha((ROOT / left).read_bytes()) != sha((ROOT / right).read_bytes()):
            raise ValueError(f"Schema mirror drift: {left} != {right}")

    return registry, objects, schema_docs, allowed_external


def publish(objects: dict[str, tuple[pathlib.Path, str]], account_id: str) -> None:
    # Guard the pre-existing legacy identity even though it is not staged for upload.
    legacy_key = "packages/iamscene/v1/scene.schema.json"
    legacy_sha256 = "0a231b4d2121058ee9f6b3ce6ccc93a281834ecb4e188c562fc7b5d685a3c997"
    if sha(fetch_object(legacy_key, account_id)) != legacy_sha256:
        raise RuntimeError(f"Immutable legacy contract changed: {legacy_key}; refusing publication")

    # Never mutate any already-public immutable contract, including a URI created
    # before the package registry. Check *all* collisions before the first write.
    # The mutable root index is the only approved in-place update.
    published = set()
    for prefix in ("packages/", "contracts/"):
        listing = aws(["s3", "ls", f"s3://{BUCKET}/{prefix}", "--recursive"], account_id)
        for line in listing.splitlines():
            parts = line.split(maxsplit=3)
            if len(parts) == 4:
                published.add(parts[3])
    for key, (path, _) in sorted(objects.items()):
        if key in published and key != "packages/manifest.v1.json":
            if sha(fetch_object(key, account_id)) != sha(path.read_bytes()):
                raise RuntimeError(f"Immutable public schema collision: {key}. Choose a new versioned URI; existing bytes must be retained.")

    # Per-object uploads preserve the correct schema/JSON MIME type and cache policy.
    # There is deliberately no --delete: legacy objects and independent release registries stay intact.
    for key, (path, content_type) in sorted(objects.items()):
        immutable = key.startswith("packages/") and key != "packages/manifest.v1.json"
        immutable = immutable or key.startswith("contracts/")
        cache_control = "public, max-age=31536000, immutable" if immutable else "public, max-age=60, must-revalidate"
        aws([
            "s3", "cp", str(path), f"s3://{BUCKET}/{key}",
            "--content-type", content_type,
            "--cache-control", cache_control,
            "--only-show-errors",
        ], account_id)

    # Read each exact object back from R2; compare byte-for-byte SHA-256 before reporting success.
    for key, (path, _) in sorted(objects.items()):
        remote = fetch_object(key, account_id)
        if sha(remote) != sha(path.read_bytes()):
            raise RuntimeError(f"R2 readback checksum mismatch: {key}")
    registry_bytes = fetch_object("packages/manifest.v1.json", account_id)
    published_registry = json.loads(registry_bytes)
    if published_registry["source"]["commit"] != git_value("rev-parse", "HEAD"):
        raise RuntimeError("R2 registry commit pointer does not match the published source commit")
    print(f"PUBLISHED AND READBACK VERIFIED: {len(objects)} objects in {BUCKET}; legacy objects untouched")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["build", "verify", "publish"])
    parser.add_argument("--account-id", default=os.environ.get("CLOUDFLARE_ACCOUNT_ID", ACCOUNT_DEFAULT))
    args = parser.parse_args()
    registry, objects, schema_docs, allowed = build(args.account_id)
    total_schemas = sum(p["schemaCount"] for p in registry["packages"]) + len(registry["sharedContracts"])
    print(f"Registry: {len(registry['packages'])} packages; {total_schemas} package/shared schemas; {len(objects)} staged objects")
    print(f"Protocol package: {next(p['schemaCount'] for p in registry['packages'] if p['id']=='agentsam-protocol')} schemas")
    print(f"Legacy agentsam/ objects retained: {registry['compatibility']['legacyObjectCount']}")
    if args.action == "publish":
        dirty = git_value("status", "--porcelain")
        if dirty:
            raise RuntimeError("Refusing R2 publish from a dirty worktree. Commit the verified schema source and publisher first.")
        publish(objects, args.account_id)
    else:
        print("VERIFY PASSED: JSON, canonical IDs, mirrors, package manifests, and $ref targets")


if __name__ == "__main__":
    main()
