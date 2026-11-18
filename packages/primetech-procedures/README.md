# PrimeTech Procedures — Creative Engineering Execution

**Portable, versioned, deterministic workflows that turn an authored technical decision into real, verifiable artifacts.**

PrimeTech Procedures is **not** another agent, scheduler, terminal, shell provider, data registry or creative app. It is an engineering workflow layer using existing AgentSam/SAM authorization, operation routing and receipts. Procedures should be reusable by standalone app installers, the desktop host, the Cloudflare host and the Python/TypeScript SDKs without copying their source.

## Production disciplines

- **Architecture and BIM:** model validation, semantic coordination, design-review drawings, revision-bound renders and documentation handoffs.
- **Mechanical and industrial:** native geometry operations, assembly checks, dimensional evidence and review-only manufacturing outputs.
- **Spatial worlds:** asset lineage, scene migrations, camera/lighting review, render reproducibility and format interoperability.
- **Motion and media:** source media inventory, deterministic timeline/render preparation, codec verification and post-production receipts.
- **Brands and merchandise:** source-art integrity, manufacturing preflight, derivative verification and variant-ready handoffs.
- **Software and CMS:** schema synchronization, tenant-safe data migrations, application release verification, deployment and real-host acceptance.

These are workflow categories, **not claims that every procedure exists today**. New operations graduate only with a manifest, source owner, tests, real outputs and receipts.

## Existing procedure examples

- `repo.asset.inventory@0.1.0`: bounded, read-only native source inventory. Files: FCStd, IFC, Blender, STEP, DXF, SVG, GLB and related formats. Produces hashes, explicit truncation and deterministic JSON.
- `cad.motor-bearing-end-plate`: specialist native CAD/CAM review candidate whose own README describes the parametric revision and verification boundaries. CAM outputs remain simulation/review-only, not approved machine-control instructions.

## Python is a first-class SDK participant

The PyPI distribution is **`agentsam-sdk`**; the Python namespace is `agentsam_sdk`. Public PyPI is currently 0.1.0, while SDK source declares 0.2.0 and already contains `agentsam_sdk.procedures.ProcedureClient`, plus native OCCT and FreeCAD host utilities.

Use the existing Python `ProcedureClient` and the existing canonical SAM operation. Do **not** build a separate privileged Python execution framework. Its injected invoker is host-owned and authorization-scoped:

```python
from agentsam_sdk.procedures import ProcedureClient

# supplied by an authenticated host, never a raw arbitrary shell executor
client = ProcedureClient(invoke=approved_procedure_operation)
receipt = client.run('repo.asset.inventory', '0.1.0', {})
```

The source API must be released on PyPI and tested from a clean installed wheel **before** dependent procedures can require it in their runtime. Until then the existing stdlib-only procedure entrypoints remain the compatibility path; avoid a breaking switch to an unavailable published version.

Python module APIs should own reusable deterministic logic. Small procedure entrypoints should validate the versioned manifest, call the SDK module, and emit its existing output schema; they should not copy a second implementation. Avoid forcing Python-only dependencies into browser bundles or the npm root.

## Procedure definition

A real procedure includes ID/version, declared effects, input/output schemas, allowed project/resource scope, required capabilities and tool versions, pinned entrypoint, source hash, ownership, bounded compute limits, fixtures, verification and explicit operator review requirements.

Precedence: existing domain operation → canonical versioned procedure → approved bounded shell composition. Use Python for deterministic data/geometry orchestration, TypeScript for browser/host integration, native CAD/Blender for actual artifacts. Do not implement physics or geometry in an imitation Python kernel.

## Trust and evidence

Trusted project root and tenant identity resolve through the host. Storage comes from installation bindings, never a hardcoded customer bucket. Read-only procedures may use `sam.superbash` only if an authorized host explicitly binds that operation. Writes require host approval and idempotency; shell access is not a sandbox. Physical machinery and production actuation are deliberately outside this offline procedure system.

Each completed procedure records exact source revision, manifest and entrypoint hashes, request hash, output hashes, runtime/tool versions, exit status, verification result, operation receipt, destination and performance. The result is not complete until the real files exist and can be independently reopened.

## Test and release gates

```sh
npm --prefix packages/primetech-procedures test
python3.12 -m unittest discover -s packages/primetech-procedures/test -v
python3 -m unittest discover -s python/tests -v
```

The package is private until its own portability and packaging gates pass. Publishing a PyPI API or an npm procedure wrapper is not evidence that host installation, cloud bindings or deployed execution have been completed.
