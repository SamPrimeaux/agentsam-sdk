# Proof, geometry checks, triage

## The hash chain (Blender)

Each result echoes the sha256 of the file it read, so a chain can be checked mechanically:

```
build         → artifact.sha256 = H
inspect       → input.sha256    = H     (same file inspected)
render-preview→ input.sha256    = H, artifact.sha256 = P
export        → input.sha256    = H, artifact.sha256 = E
```

If any `input.sha256` differs from the build's `artifact.sha256`, the step ran on a different
file. Say so; do not report success. Quote hashes, not "it worked".

```sh
OUT=$(mktemp -d)   # temp, never Downloads
agentsam cad blender build examples/cad/blender-box-with-hole.recipe.json --out "$OUT/box.blend" --json
agentsam cad blender inspect "$OUT/box.blend" --json
agentsam cad blender render-preview "$OUT/box.blend" --out "$OUT/box.png" --json
agentsam cad blender export "$OUT/box.blend" --format glb --out "$OUT/box.glb" --json
```

## Check geometry, not the exit code

- Blender `inspect` → `scene.objects[]` gives `type`, `dimensions`, `location`, `scale`, `world_bounds`,
  `materials`, `modifiers`; plus `cameras`, `collections`, `active_camera`. Compare these to the
  request. The shipped box-with-hole recipe yields `Plate` (MESH, 80 × 50 × 4), `Key Light`,
  `Preview Camera`. Dimensions prove the envelope only. Each MESH object also carries `mesh`
  (modifiers applied, world space): `vertices/edges/faces/triangles`, `shells`,
  `non_manifold_edges`, and for closed manifolds `genus` and `volume`. A through-hole is
  `genus: 1` with `shells: 1`; a solid plate is genus 0. The shipped plate reports genus 1 and a
  volume just under 16000 (envelope minus the ~452 mm³ bore and bevel loss). `volume` and `genus`
  are `null` for an open mesh; `non_manifold_edges` says why.
- FreeCAD (`agentsam cad build`, `freeCadBuild`) → require `ok:true` and check `metrics.volume`
  against the arithmetic you expect (80×50×4 minus π·5²·4 = 15685.84 for a 10 mm hole).
- OCCT → require `ok:true`, `engine:"occt"`, the requested `operation`, and for inspection a
  positive finite `volume_mm3`. A cut should lower volume versus the uncut solid.
- Project builds → read the per-revision receipts in
  `<root>/.agentsam/cad/artifacts/<id>/<rev>/design_model_*.json` and confirm the revision matches
  the one you edited.
- Always open the preview PNG and look at it.

## Triage

| Symptom | Meaning | Do |
|---|---|---|
| `available:false` from `status` | engine not found | relay the install guidance; pass `--blender-bin` or fix `~/.agentsam/cad.json` if installed elsewhere |
| `revision_conflict` | `expected_revision` is stale | re-read, re-derive the edit on the current head, retry once |
| `project_invalid` / `valid:false` | validation failed | fix the listed errors; nothing was written |
| `element_not_found:<id>` | edit targets a missing element | re-read the project, correct the id |
| `unsupported_operation:<type>` | no such edit | use a supported type or report the gap |
| `roof_geometry_not_supported` | v1 builder has no roof geometry | report it; do not fake a roof |
| `occt_receipt_missing` / `occt_receipt_unverified` | native call didn't prove itself | treat as failed; run `agentsam-occt --doctor` |
| `cad_production_authorized_provider_required` | no host provider for a production op | the capability isn't available here; say so |
| Docker `:8793` unreachable | lane down | use a discovered native lane or report |
| Blender timeout | exceeded `--timeout` (1..600) | raise it within bounds or simplify the recipe |

## Re-verify this skill (snapshot 2026-11-23)

Run these on the current machine; the snapshot below will drift, the commands will not.

```sh
agentsam cad blender status --json
agentsam cad project workflows
ROOT=$(mktemp -d)
python3 -c "import json;print(json.dumps({'project':json.load(open('test/fixtures/cad/courtyard-house.json'))}))" > "$ROOT/in.json"
agentsam cad project workflow cad.house_baseline "$ROOT/in.json" --root "$ROOT"
```

Observed 2026-11-23: Blender 5.0.1 (native lane); OCCT 7.9.3 with the capability list in
`engines-and-lanes.md`; Blender `build`, `inspect`, `render-preview` and `export` (glb) all succeeded
with one matching sha256 chain; `cad.house_baseline` and `cad.edit_preview` both completed all
seven steps, and a stale `expected_revision` failed `revision_conflict`; the Docker CAD service was
not running. FreeCAD and OpenSCAD binaries were discovered in `~/.agentsam/cad.json` but their
build paths were not exercised in this pass.
