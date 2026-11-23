# Proof, geometry checks and triage

## Hash chain: Blender

Each stage must echo the SHA-256 of the exact input it read:

```text
build          artifact.sha256 = H
inspect        input.sha256    = H
render-preview input.sha256    = H; artifact.sha256 = P
export         input.sha256    = H; artifact.sha256 = E
```

If any input hash differs from the build output hash, that stage inspected a different file. Report
the mismatch; do not claim the pipeline succeeded.

```sh
OUT=$(mktemp -d)
# Node SDK CLI
agentsam cad blender build examples/cad/blender-box-with-hole.recipe.json --out "$OUT/box.blend" --json
agentsam cad blender inspect "$OUT/box.blend" --json
agentsam cad blender render-preview "$OUT/box.blend" --out "$OUT/box.png" --json
agentsam cad blender export "$OUT/box.blend" --format glb --out "$OUT/box.glb" --json
```

## Check geometry, not just exit codes

- **Blender:** compare requested dimensions, transforms, world bounds and materials. Inspect the
  evaluated mesh metrics: vertices, edges, faces, triangles, shells, non-manifold edges, genus and
  volume. For a closed single-shell mesh, genus 1 is evidence of one through-hole; genus 0 is a
  closed solid without a handle/hole. Open meshes may have null genus/volume; inspect the
  non-manifold evidence and do not overstate the result.
- **FreeCAD:** require `ok:true`; check B-Rep volume, area, face/edge/vertex counts and bounds against
  the expected geometry. For a plate 80×50×4 mm with a 10 mm through-hole, the nominal volume is
  `80×50×4 − π×5²×4 ≈ 15685.84 mm³` before any bevels or other features.
- **OCCT:** require `ok:true`, `engine:"occt"`, the requested operation, and a real inspection
  receipt. `probe_occt()` creates a 20×30×10 mm box, exports STEP, reopens it and checks 6000 mm³.
  For a boolean cut, compare the measured volume with the uncut source.
- **Project outputs:** tie every artifact to the exact project revision and source element IDs.
  V2 `generated` requires URI, SHA-256, source revision, executor/version and correlated receipt;
  `validated` additionally requires validation evidence. Geometry changes stale dependent outputs.
- **IFC edits:** keep the original file. Record its SHA-256, run validate/inspect, edit to a new path,
  validate the new file and diff source vs output. Require no new validation errors, all GlobalIds
  preserved and no changes outside the edited objects.
- **Service downloads:** use `download_to()` for large files. Require verified byte count and SHA-256
  before atomic promotion. HTTP success alone is not artifact proof.
- **Visuals:** open the generated preview and inspect it. A correct hash does not prove a correct
  model or presentation.

## Triage

| Symptom | Meaning | Action |
|---|---|---|
| Engine `available:false` / `ready:false` | Binary absent or native probe failed | Read the typed error and doctor receipt; use only a discovered alternate lane |
| `revision_conflict` | Expected revision is stale | Re-read the current head, re-derive the edit, retry once |
| `project_invalid` / `valid:false` | Contract or geometry validation failed | Fix reported errors; no write should be claimed |
| `element_not_found:<id>` | Edit targets a missing element | Re-read source and correct the ID |
| `unsupported_operation:<type>` | Operation is not in the current allowlist | Do not improvise an executor; report the gap |
| `cad_job_host_not_configured` | No trusted host operation invoker was bound | Bind the authenticated host adapter; do not replace it with a shell or stdio escape hatch |
| `cad_service_operation_not_advertised` | Provider did not advertise the operation | Stop; use a supported provider or report unavailable |
| `cad_artifact_requires_streaming` | Artifact exceeds inline download limit | Use `download_to()` and verify digest/byte count |
| `cad_host_endpoint_https_required` | Non-loopback HTTP endpoint was rejected | Use HTTPS; plain HTTP is only for loopback development unless explicitly configured |
| `cad_production_authorized_provider_required` | A target operation has no authorized host provider | It is not available on this host; do not call it implemented |
| `occt_receipt_missing` / `occt_receipt_unverified` | Native engine did not prove the requested operation | Treat as failed; rerun `agentsam-occt --doctor` and inspect the operation receipt |
| `cad_ifc_inspection_incomplete` | IFC inspection was truncated/incomplete | Page the inspection or reduce the requested scope; do not project partial semantics |
| `roof_geometry_not_supported` | Legacy v1 project builder lacks that geometry path | Treat as a v1-only limitation; use a host-advertised v2 operation or report unavailable |
| Docker CAD service unreachable | That execution lane is down | Use another verified authorized lane or report unavailable |
| Blender timeout | Execution exceeded bounded timeout | Simplify the recipe or increase the timeout within its allowed range |

## Live re-verification

Both npm and pip install an `agentsam` command. Check `which agentsam` and `agentsam --version`
before running commands. Then run only the checks available in that installation:

```sh
# Node SDK
agentsam cad blender status --json
agentsam cad ifc status --json
agentsam cad project tools

# Python SDK
agentsam cad doctor --engine all

# IAMScene adapter registry
iamscene formats --binary ~/.agentsam/bin/agentsam-occt
```

A readiness result is machine- and lane-specific. Record the engine version and proof receipt from
the current run; do not copy an old machine's success into a new host's capability claim.
