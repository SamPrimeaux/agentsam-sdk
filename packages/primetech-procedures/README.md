# PrimeTech Procedures

PrimeTech is a versioned workflow catalog and orchestration layer. It does not create a second SAM kernel, agent runtime, terminal daemon, scheduler, or D1 registry. Execution is delegated to an existing authorized SAM operation, initially sam.superbash.

## First procedure: repo.asset.inventory@0.1.0

The read-only Python procedure inventories native CAD, BIM and visualization files, including FreeCAD, IFC, Blender, STEP, STL, DXF, SVG and GLB formats. It emits deterministic JSON, per-file SHA-256 hashes within declared limits, interpreter version, and explicit hash/truncation status. It skips dependency, hidden, build, local runtime and symlinked directories. It does not modify project files.

## Execution boundary

The exported createPrimeTechProcedureHandler factory requires a trusted project root, a capability-availability check, and an injected invokeSamOperation callback. It invokes only the existing sam.superbash operation with a generated wrapper that references the pinned procedure entrypoint and schema-validated JSON input. No caller-provided shell command or project root is accepted. Procedure effects beyond read require a separate host approval callback; physical hardware procedures are rejected.

The host must bind this handler only when the authenticated SAM adapter can invoke sam.superbash. The JavaScript bridge remains read-only.

## Evidence

Each run records manifest and entrypoint hashes, input/output hashes, execution ID, exit status, verification result, per-stage and total timings, and a receipt. The JSON output artifact is stored under the host-provided receipt directory's artifacts/primetech subtree. The summarizeProcedureRuns helper aggregates success/failure counts, mean and percentile durations, and failure codes from those receipts for later performance tuning. No D1 table or new database registry is created.

## Validation

Run npm --prefix packages/primetech-procedures test and python3.12 -m unittest discover -s packages/primetech-procedures/test -v.

The package is currently private to this monorepo. Publish it only after a separate portability and packaging review.
