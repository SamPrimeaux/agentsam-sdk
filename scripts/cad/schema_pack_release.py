#!/usr/bin/env python3
"""Deterministic CAD v2 schema bootstrap, validation, offline staging and R2 release.

Source of truth: protocol/cad/v2.  Releases are immutable; registry.v1.json is
the only mutable pointer. No draft/unpublished state is ever uploaded.
Usage:
 python3 scripts/cad/schema_pack_release.py bootstrap --source-dir /private/tmp/agentsam-cad-schema-validation-20261019
 python3 scripts/cad/schema_pack_release.py verify
 python3 scripts/cad/schema_pack_release.py stage
 python3 scripts/cad/schema_pack_release.py publish  # requires pushed clean main + R2 S3 credentials
"""
import argparse
import copy
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "protocol/cad/v2"
STAGED = ROOT / "apps/cad-creator/schemas/v2"
BUCKET = "inneranimalmedia-schemas"
RELEASE = "2.6.13-modules.2"
PUBLIC = "https://schemas.inneranimalmedia.com/apps/cad-creator/schemas/"
PREFIX = "apps/cad-creator/schemas/"
RELEASE_PREFIX = f"{PREFIX}releases/{RELEASE}/v2/"
BASE = PUBLIC + f"releases/{RELEASE}/v2/"
REGISTRY_KEY = PREFIX + "registry.v1.json"
NAME = "cad.schema-pack.v1"


def encode(data):
    return (json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encode(obj))


def run(cmd, *, env=None, capture=True):
    proc = subprocess.run(cmd, cwd=str(ROOT), env=env, text=True, capture_output=capture)
    if proc.returncode:
        raise RuntimeError("Command failed: " + " ".join(cmd) + "\n" + (proc.stderr or proc.stdout or ""))
    return proc.stdout.strip() if capture else ""


def contract(name, title, props, required, defs=None, all_of=None):
    d = {"$schema": "https://json-schema.org/draft/2020-12/schema",
         "$id": BASE + name, "title": title, "type": "object",
         "additionalProperties": False, "required": required, "properties": props}
    if defs:
        d["$defs"] = defs
    if all_of:
        d["allOf"] = all_of
    return d


def S(**kwargs):
    return dict(type="string", **kwargs)


def R(path):
    return {"$ref": path}


def A(items, **kwargs):
    return dict(type="array", items=items, **kwargs)


def O(props, required=(), *, allow=False):
    return {"type": "object", "properties": props, "required": list(required), "additionalProperties": allow}


def extra():
    sid = S(minLength=1)
    sha256 = S(pattern="^[a-fA-F0-9]{64}$")
    frame = O({"frameId": sid, "translation": A({"type": "number"}, minItems=3, maxItems=3),
               "rotation": A({"type": "number"}, minItems=4, maxItems=4)}, ["frameId", "translation", "rotation"])
    joint = O({"id": sid, "kind": S(enum=["fixed", "revolute", "continuous", "prismatic", "spherical", "planar", "floating"]),
               "parentLinkId": sid, "childLinkId": sid, "originFrameId": sid,
               "axis": A({"type": "number"}, minItems=3, maxItems=3),
               "limits": O({"lower": {"type": "number"}, "upper": {"type": "number"},
                            "velocity": {"type": "number", "exclusiveMinimum": 0},
                            "effort": {"type": "number", "minimum": 0}})},
              ["id", "kind", "parentLinkId", "childLinkId", "originFrameId"])
    link = O({"id": sid, "entityIds": A(sid, uniqueItems=True),
              "mass": {"type": "number", "minimum": 0},
              "centerOfMassFrameId": sid, "inertiaTensor": A({"type": "number"}, minItems=9, maxItems=9),
              "collisionEntityIds": A(sid, uniqueItems=True)}, ["id", "entityIds"])
    robot = O({"id": sid, "name": S(), "baseFrameId": sid, "rootLinkId": sid,
               "links": A(link, minItems=1), "joints": A(joint),
               "endEffectors": A(O({"id": sid, "linkId": sid, "toolFrameId": sid,
                                   "toolEntityIds": A(sid, uniqueItems=True)}, ["id", "linkId", "toolFrameId"])),
               "workspaceRefs": A(sid, uniqueItems=True),
               "controllerProfileRef": sid, "safetyProfileRef": sid},
              ["id", "baseFrameId", "rootLinkId", "links", "joints"])
    robots = contract("modules/robotics.v1.schema.json", "Robotics digital-twin and kinematics module",
                      {"schema": {"const": "cad.module.robotics.v1"}, "version": {"const": 1},
                       "robots": A(robot), "motionPlanRefs": A(sid, uniqueItems=True),
                       "simulationRefs": A(sid, uniqueItems=True),
                       "extensions": O({}, allow=True)}, ["schema", "version", "robots"])
    reference = contract("interchange/reference-model.schema.json", "External reference model attachment and revision contract",
                         {"id": sid, "name": S(), "sourceUri": S(minLength=1), "format": S(minLength=1),
                          "sha256": sha256, "byteSize": {"type": "integer", "minimum": 0},
                          "sourceProjectId": sid, "sourceRevision": {"oneOf": [sid, {"type": "integer", "minimum": 0}]},
                          "referenceFrameId": sid, "placement": frame,
                          "unit": S(), "crs": S(),
                          "attachmentPolicy": S(enum=["read-only", "federated", "editable-copy"]),
                          "elementMappings": A(O({"externalId": sid, "entityId": sid}, ["externalId", "entityId"])),
                          "loadedAt": S(format="date-time"), "licenseRef": sid,
                          "extensions": O({}, allow=True)},
                         ["id", "sourceUri", "format", "sha256", "sourceRevision", "referenceFrameId", "attachmentPolicy"])
    keyframe = O({"id": sid, "timeSeconds": {"type": "number", "minimum": 0},
                  "placement": frame, "targetEntityId": sid,
                  "focalLengthMm": {"type": "number", "exclusiveMinimum": 0},
                  "fieldOfViewDegrees": {"type": "number", "exclusiveMinimum": 0, "maximum": 180},
                  "easing": S(enum=["linear", "ease-in", "ease-out", "ease-in-out", "hold"])},
                 ["id", "timeSeconds", "placement"])
    camera = contract("presentation/camera-path.schema.json", "Revision-bound reusable camera animation path",
                      {"id": sid, "sourceRevision": {"oneOf": [sid, {"type": "integer", "minimum": 0}]},
                       "sceneId": sid, "coordinateFrameId": sid, "keyframes": A(keyframe, minItems=2),
                       "interpolation": S(enum=["linear", "catmull-rom", "bezier", "step"]),
                       "loop": {"type": "boolean"}, "collisionMode": S(enum=["disabled", "detect", "avoid"]),
                       "extensions": O({}, allow=True)},
                      ["id", "sourceRevision", "coordinateFrameId", "keyframes", "interpolation"])
    annotation = O({"id": sid, "kind": S(enum=["linear-dimension", "angular-dimension", "radial-dimension", "level-marker",
                                                "leader", "symbol", "text", "hatch", "detail-reference", "section-marker"]),
                    "entityRefs": A(sid, uniqueItems=True), "layer": S(),
                    "styleRef": sid, "text": S(), "measurement": {"type": "number"},
                    "unit": S(), "geometryRef": sid}, ["id", "kind"])
    drawing = contract("presentation/drawing.schema.json", "Revision-derived technical drawing definition",
                       {"id": sid, "number": sid, "name": S(), "sourceRevision": {"oneOf": [sid, {"type": "integer", "minimum": 0}]},
                        "viewId": sid, "projection": S(enum=["orthographic", "perspective", "section", "detail", "diagram"]),
                        "discipline": S(), "scale": {"type": "number", "exclusiveMinimum": 0},
                        "annotations": A(annotation), "lineStyleRefs": A(sid, uniqueItems=True),
                        "hatchStyleRefs": A(sid, uniqueItems=True), "sheetRefs": A(sid, uniqueItems=True),
                        "modelValidationRef": sid, "revisionStatus": S(enum=["draft", "for-review", "issued", "superseded"]),
                        "extensions": O({}, allow=True)},
                       ["id", "sourceRevision", "viewId", "projection"])
    preset = O({"id": sid, "format": S(enum=["png", "exr", "mp4", "webm", "glb", "usdz", "pdf"]),
                "width": {"type": "integer", "minimum": 1}, "height": {"type": "integer", "minimum": 1},
                "colorSpace": S(), "outputId": sid, "required": {"type": "boolean"}}, ["id", "format", "outputId"])
    production = contract("presentation/production.schema.json", "Reproducible scene production and rendering request",
                          {"id": sid, "projectId": sid, "sourceRevision": {"oneOf": [sid, {"type": "integer", "minimum": 0}]},
                           "sceneId": sid, "cameraPathId": sid, "renderer": O({"providerId": sid, "engine": S(), "version": S(),
                              "engineSettings": O({}, allow=True)}, ["providerId", "engine"]),
                           "frameRange": O({"start": {"type": "integer", "minimum": 0},
                                            "end": {"type": "integer", "minimum": 0},
                                            "fpsNumerator": {"type": "integer", "minimum": 1},
                                            "fpsDenominator": {"type": "integer", "minimum": 1}},
                                           ["start", "end", "fpsNumerator", "fpsDenominator"]),
                           "outputs": A(preset, minItems=1), "sourceSceneHash": sha256, "receiptIds": A(sid, uniqueItems=True),
                           "extensions": O({}, allow=True)},
                          ["id", "projectId", "sourceRevision", "sceneId", "renderer", "outputs"])
    delivery_output = O({"id": sid, "kind": sid, "format": sid, "required": {"type": "boolean"},
                         "state": S(enum=["planned", "running", "completed", "failed", "cancelled", "superseded"]),
                         "sourceRevision": {"oneOf": [sid, {"type": "integer", "minimum": 0}]},
                         "outputId": sid, "artifactUri": S(), "sha256": sha256, "byteSize": {"type": "integer", "minimum": 0},
                         "validationResultIds": A(sid, uniqueItems=True), "receiptId": sid,
                         "viewer": S(enum=["model", "bim", "drawing", "walkthrough", "film", "download", "none"]),
                         "professionalReviewRequired": {"type": "boolean"}},
                        ["id", "kind", "format", "required", "state", "sourceRevision"],
                       )
    delivery = contract("validation/deliverable-manifest.schema.json", "Traceable deliverable and viewer handoff manifest",
                        {"schema": {"const": "cad.delivery-manifest.v1"}, "id": sid, "projectId": sid,
                         "projectRevision": {"oneOf": [sid, {"type": "integer", "minimum": 0}]},
                         "profile": sid, "outputs": A(delivery_output, minItems=1),
                         "validationIds": A(sid, uniqueItems=True),
                         "generatedAt": S(format="date-time"), "extensions": O({}, allow=True)},
                        ["schema", "id", "projectId", "projectRevision", "profile", "outputs"])
    # An artifact may be marked complete only with verifiable identity and evidence.
    delivery["properties"]["outputs"]["items"]["allOf"] = [
        {"if": {"properties": {"state": {"const": "completed"}}, "required": ["state"]},
         "then": {"properties": {"outputId": sid, "artifactUri": S(), "sha256": sha256, "receiptId": sid},
                  "required": ["outputId", "artifactUri", "sha256", "receiptId"]}}]
    return {x["$id"][len(BASE):]: x for x in [robots, reference, camera, drawing, production, delivery]}


def module_paths(root=SOURCE):
    return sorted(str(x.relative_to(root)) for x in root.rglob("*.schema.json"))


def build_manifest():
    entries = []
    for name in module_paths():
        b = (SOURCE / name).read_bytes()
        d = json.loads(b)
        if d.get("$id") != BASE + name:
            raise ValueError("Immutable schema $id does not match its release URL: " + name)
        if d.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            raise ValueError("Unexpected JSON Schema draft: " + name)
        entries.append({"path": name, "uri": BASE + name, "sha256": sha(b), "bytes": len(b)})
    return {"schema": NAME, "packVersion": RELEASE, "sourceAuthority": "agentsam-sdk/protocol/cad/v2",
            "publicBaseUri": BASE, "bucket": BUCKET, "objectPrefix": RELEASE_PREFIX,
            "modules": entries, "validationLayers": ["document", "semantic", "native-geometry", "deliverable"],
            "compatibility": {"existingProjectV2Unchanged": True, "newModulesOptIn": True,
                              "strictRootBindingRequiresMigration": True}}


def bootstrap(seed):
    if SOURCE.exists() and any(SOURCE.iterdir()):
        raise RuntimeError("Refusing to overwrite existing canonical protocol/cad/v2 source")
    manifest = json.loads((seed / "schema-pack.manifest.json").read_text())
    if len(manifest.get("modules", [])) != 22:
        raise ValueError("Expected original 22-module pack")
    for mod in manifest["modules"]:
        name = mod["path"]
        doc = json.loads((seed / name).read_text())
        doc["$id"] = BASE + name
        if name == "core/geometry-constraint.schema.json":
            # Strict-Ajv annotation only; this does not change allowed instance values.
            doc["allOf"][0]["then"]["properties"] = {"value": {}}
        write_json(SOURCE / name, doc)
    for name, doc in extra().items():
        write_json(SOURCE / name, doc)
    write_json(SOURCE / "schema-pack.manifest.json", build_manifest())
    print("Bootstrapped", len(module_paths()), "complete CAD contract modules")


def verify():
    if not SOURCE.exists():
        raise ValueError("No canonical source at " + str(SOURCE))
    expected = build_manifest()
    manifest_file = SOURCE / "schema-pack.manifest.json"
    if not manifest_file.is_file() or manifest_file.read_bytes() != encode(expected):
        raise ValueError("Manifest differs from deterministic source; run 'manifest' to regenerate")
    known = {x["uri"] for x in expected["modules"]}
    for mod in expected["modules"]:
        doc = json.loads((SOURCE / mod["path"]).read_text())
        refs = []
        def walk(v):
            if isinstance(v, dict):
                if "$ref" in v:
                    refs.append(v["$ref"])
                for child in v.values():
                    walk(child)
            elif isinstance(v, list):
                for child in v:
                    walk(child)
        walk(doc)
        for ref in refs:
            full = urllib.parse.urljoin(mod["uri"], ref)
            target = full.split("#", 1)[0]
            if target not in known:
                raise ValueError("Unresolved/out-of-pack ref " + ref + " from " + mod["path"])
            fragment = urllib.parse.unquote(full.partition("#")[2])
            if fragment.startswith("/"):
                other = json.loads((SOURCE / target[len(BASE):]).read_text())
                for component in fragment[1:].split("/"):
                    component = component.replace("~1", "/").replace("~0", "~")
                    other = other[int(component)] if isinstance(other, list) else other[component]
    # Ajv compiles every schema in strict 2020-12 mode, including transitive refs.
    js = """
const fs=require('fs'),path=require('path'),Ajv=require('ajv/dist/2020').default;
const root=process.argv[1],m=JSON.parse(fs.readFileSync(path.join(root,'schema-pack.manifest.json')));
const a=new Ajv({strict:true,allErrors:true,validateFormats:false});
for(const x of m.modules)a.addSchema(JSON.parse(fs.readFileSync(path.join(root,x.path))));
for(const x of m.modules)if(!a.getSchema(x.uri))throw Error('Missing validator '+x.path);
console.log('Ajv Draft 2020-12 strict compile:',m.modules.length,'schemas');
"""
    print(run(["node", "-e", js, str(SOURCE)]))
    print("Manifest hashes, $ids and $refs verified:", len(expected["modules"]), "modules")
    return expected


def stage():
    m = verify()
    for x in m["modules"]:
        target = STAGED / x["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / x["path"], target)
        if sha(target.read_bytes()) != x["sha256"]:
            raise RuntimeError("Staging hash drift: " + x["path"])
    shutil.copyfile(SOURCE / "schema-pack.manifest.json", STAGED / "schema-pack.manifest.json")
    actual = set(module_paths(STAGED))
    expected = {x["path"] for x in m["modules"]}
    if actual != expected:
        raise ValueError("Stale or missing packaged schemas: " + str(actual ^ expected))
    print("Staged", len(expected), "offline CAD schemas in", STAGED)


def cloud_cmd(args, output=False):
    env = os.environ.copy()
    env["AWS_ACCESS_KEY_ID"] = env.get("R2_ACCESS_KEY_ID", env.get("AWS_ACCESS_KEY_ID", ""))
    env["AWS_SECRET_ACCESS_KEY"] = env.get("R2_SECRET_ACCESS_KEY", env.get("AWS_SECRET_ACCESS_KEY", ""))
    env["AWS_DEFAULT_REGION"] = "auto"
    ep = env.get("R2_ENDPOINT")
    if not ep or not env["AWS_ACCESS_KEY_ID"] or not env["AWS_SECRET_ACCESS_KEY"]:
        raise RuntimeError("R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY missing")
    return run(["aws", "--endpoint-url", ep, "s3api"] + args, env=env)


def remote_bytes(key):
    with tempfile.TemporaryDirectory() as temp:
        out = pathlib.Path(temp) / "object"
        try:
            cloud_cmd(["get-object", "--bucket", BUCKET, "--key", key, str(out)])
        except RuntimeError as e:
            if "NoSuchKey" in str(e) or "404" in str(e) or "Not Found" in str(e):
                return None
            raise
        return out.read_bytes()


def publish():
    m = verify()
    stage()
    if run(["git", "branch", "--show-current"]) != "main":
        raise RuntimeError("Publishing requires canonical main, not a feature worktree")
    if run(["git", "status", "--porcelain", "--untracked-files=no"]):
        raise RuntimeError("Tracked worktree changes detected; commit before publication")
    tracked = set(run(["git", "ls-files"]).splitlines())
    required = ["protocol/cad/v2/schema-pack.manifest.json", "scripts/cad/schema_pack_release.py",
                "apps/cad-creator/scripts/stage-cad-v2-schema.mjs"] + ["protocol/cad/v2/" + x["path"] for x in m["modules"]]
    if any(f not in tracked for f in required):
        raise RuntimeError("Release source/scripts are not committed to Git main")
    local = run(["git", "rev-parse", "HEAD"])
    remote = run(["git", "ls-remote", "origin", "refs/heads/main"]).split("\t", 1)[0]
    if local != remote:
        raise RuntimeError("GitHub main is not exactly this local source commit; push main first")
    payload = [(x["path"], (SOURCE / x["path"]).read_bytes()) for x in m["modules"]]
    payload.append(("schema-pack.manifest.json", (SOURCE / "schema-pack.manifest.json").read_bytes()))
    # Immutable write-once release: existing different bytes abort instead of overwriting.
    for name, body in payload:
        key = RELEASE_PREFIX + name
        previous = remote_bytes(key)
        if previous is not None and previous != body:
            raise RuntimeError("Immutable R2 release conflicts with existing object: " + key)
        if previous is None:
            with tempfile.TemporaryDirectory() as d:
                f = pathlib.Path(d) / "object.json"
                f.write_bytes(body)
                cloud_cmd(["put-object", "--bucket", BUCKET, "--key", key,
                           "--body", str(f), "--content-type", "application/schema+json" if name.endswith(".schema.json") else "application/json"])
        retrieved = remote_bytes(key)
        if retrieved != body:
            raise RuntimeError("R2 readback checksum mismatch for " + key)
        print("R2 verified", key, sha(body))
    manifest_bytes = (SOURCE / "schema-pack.manifest.json").read_bytes()
    registry = {"schema": "agentsam.schema-registry.v1", "product": "@inneranimalmedia/agentsam-cad-creator",
                "namespace": "apps/cad-creator", "release": RELEASE, "gitCommit": local,
                "manifestUri": BASE + "schema-pack.manifest.json", "manifestSha256": sha(manifest_bytes),
                "moduleCount": len(m["modules"]), "sourceAuthority": "agentsam-sdk/protocol/cad/v2"}
    with tempfile.TemporaryDirectory() as d:
        f = pathlib.Path(d) / "registry.json"
        f.write_bytes(encode(registry))
        cloud_cmd(["put-object", "--bucket", BUCKET, "--key", REGISTRY_KEY,
                   "--body", str(f), "--content-type", "application/json"])
    if remote_bytes(REGISTRY_KEY) != encode(registry):
        raise RuntimeError("Registry pointer readback mismatch")
    print("PUBLISHED:", RELEASE, "Git commit:", local, "registry:", REGISTRY_KEY)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["bootstrap", "manifest", "verify", "stage", "publish"])
    parser.add_argument("--source-dir", default="/private/tmp/agentsam-cad-schema-validation-20261019")
    args = parser.parse_args()
    if args.action == "bootstrap":
        bootstrap(pathlib.Path(args.source_dir))
    elif args.action == "manifest":
        write_json(SOURCE / "schema-pack.manifest.json", build_manifest())
    elif args.action == "verify":
        verify()
    elif args.action == "stage":
        stage()
    elif args.action == "publish":
        publish()


if __name__ == "__main__":
    main()
