---
name: agentsam-cad
description: >
  Build, inspect, preview, and export Blender models from typed recipes with `agentsam cad blender`,
  and prove each step with artifact hashes. Use for programmatic CAD, .blend/.glb/.stl/.obj
  artifacts, recipe validation, and "does Blender work here". Triggers on "blender", "cad",
  ".blend", "recipe", "export glb", "render preview", and "box with hole".
metadata:
  short-description: "Typed-recipe Blender build, inspect, preview, export, with sha256 proof between steps"
  aliases:
    - cad
    - blender
user-invocable: true
---

# CAD with Blender

AgentSam drives Blender through **typed recipes**. It never evaluates arbitrary Python. The
recipe schema is `protocol/cad/blender-recipe.schema.json`; a working example is
`examples/cad/blender-box-with-hole.recipe.json`.

## Commands

```bash
agentsam cad blender status                                   # is Blender found, and which version?
agentsam cad blender build <recipe.json> --out <model.blend> [--input <base.blend>] [--json]
agentsam cad blender inspect <model.blend> [--timeout <seconds>] [--json]
agentsam cad blender render-preview <model.blend> --out <preview.png> [--camera <name>] [--scene <name>] [--width 1024] [--height 1024]
agentsam cad blender export <model.blend> --format <glb|stl|obj> --out <artifact> [--objects <a,b>] [--collection <name>]
```

Blender is located via `--blender-bin <path>`, then `AGENTSAM_BLENDER_BIN`, then `PATH`, then
common install locations. Timeouts are bounded to 1..600 seconds (default 120).

## Prove each step with the hash

`build` prints `artifact.sha256`. `inspect` reports the same value as `input.sha256`. If they
match, you inspected the file you built. Say so with the hashes, not with "it worked".

```bash
agentsam cad blender build examples/cad/blender-box-with-hole.recipe.json --out /tmp/box.blend --json
agentsam cad blender inspect /tmp/box.blend --json      # compare input.sha256 to the build's artifact.sha256
```

The same inspect is available as the SAM operation `cad.blender.inspect` with
`{"source":"/tmp/box.blend"}` (see `agentsam-sam-operations`). `build`, `render-preview`, and
`export` are CLI-only; they are not SAM operations.

## Check the geometry, not just the exit code

A successful build lists the objects it created. Confirm they match the recipe's intent. For
example, the shipped box-with-hole recipe produced objects named `Plate`, `Key Light`, and
`Preview Camera`; read the full `inspect` scene output to confirm the geometry before claiming
the model is correct.

## Verified vs not

Verified on 2.6.12: `status`, `build`, `inspect` (CLI and SAM) with a matching hash.
Not verified: `render-preview`, `export`. Run them and read the output before relying on them.
