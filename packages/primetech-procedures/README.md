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

## Included procedures (working runtime implementations)

| Procedure | Runtime | Result |
|---|---|---|
| `repo.asset.inventory@0.1.0` | `python` | Bounded, read-only native CAD/BIM/scene source inventory with file hashes and explicit truncation |
| `repo.git.status@0.1.0` | `bash` | Actual read-only Git worktree counts for tracked changes and untracked files |
| `arch.assembly.calculate@0.1.0` | `sam_operation` | Calls `arch.assembly.thickness` and reports exact summed thickness from supplied layers; **not** a building-code approval |
| `media.asset.preflight@0.1.0` | `native_tool` | Invokes the host-bound `media.asset.inspect` operation against an owned asset and reports the stored bytes/hash |
| `media.image.optimize-asset@0.1.0` | `native_tool` | **Approved write:** optimizes an installation-owned image, saves a new derivative and keeps the original unchanged; requires operator approval |
| `cad.motor-bearing-end-plate@0.1.0` | `python` | Specialist FreeCAD/CAM review candidate with a source-inclusive delivery bundle; CAM is simulation/review-only and not approved for machining |

The catalog lists **packaged** procedures. An actual host can run one only when its required operation/tool is available, with a trusted project root and appropriate authorization. **Procedures are not read-only:** native and SAM writes are allowed when a real executor is installed and the host approves the effect. Additional SAM operations discovered from procedure manifests are not automatically granted privileged access; the SDK shell only auto-exposes extra read-only core operations. Already installed and explicitly authorized write operations such as `media.image.optimize` remain usable. Catalog availability is not proof of an installed native engine.

## Runtime kinds and verification

- **`python`**: validated package-local `.py` entrypoint invoked through the existing authorized `sam.superbash` lane, with pinned arguments and interpreter candidates.
- **`bash`**: validated package-local Bash entrypoint invoked through the same authorized SAM operation, receiving one schema-validated JSON argument. Users cannot submit arbitrary scripts or substitute an entrypoint.
- **`sam_operation`**: manifest pins `runtime.operation`; the authenticated SAM host invokes that exact registered operation, not a shell. The operation must also appear in the manifest's declared capabilities.
- **`native_tool`**: manifest pins `runtime.tool_key`; an authorized host must bind both `invokeNativeTool` and `isNativeToolAvailable`. In the SDK shell, installed SAM native-media operations are reused rather than wrapped in a new engine.

All kinds enforce input/output schemas, check the exact requested version, record manifest and (where applicable) entrypoint hashes, and emit a verified receipt. Direct SAM/native operations preserve the upstream operation receipt ID; file-based runners preserve the script execution hash and exit status.

`verification.kind = output_schema` validates the returned structured payload. `fixture_suite` and `native_validation` require the host to supply `verifyProcedureOutput({ manifest, projectRoot, input, output, execution })` and return `{ kind, ok: true, evidence }`. Missing/failed verification is **a failed procedure**, not a success badge. The host is responsible for checking actual native files, geometry or fixtures where required; output-schema validation alone is not an independent engineering sign-off.

Example for an **already authorized, scoped host** (not a new executor):

```js
import { createProcedureCatalog, createPrimeTechProcedureHandler } from '@inneranimalmedia/primetech-procedures';

const handler = createPrimeTechProcedureHandler({
  catalog: createProcedureCatalog(),
  projectRoot: trustedProjectRoot,
  invokeSamOperation: (name, input) => samHost.invoke(name, input),
  isCapabilityAvailable: name => samHost.canInvoke(name),
  invokeNativeTool: (name, input) => samHost.invoke(name, input),
  isNativeToolAvailable: name => samHost.canInvoke(name),
  authorizeProcedure: request => approvals.authorize(request),
  verifyProcedureOutput: request => nativeVerification.verify(request),
});

const receipt = await handler({ id: 'arch.assembly.calculate', version: '0.1.0',
  input: { layers: [{ name: 'sheet', thickness_in: 0.5 }, { name: 'stud', thickness_in: 3.5 }] } });
```

Those `samHost`, `approvals`, and `nativeVerification` values are supplied by an existing installation; the package does **not** provision them. The AgentSam interactive CLI binds eligible read-only packaged SAM operations and already installed native-media operations automatically, subject to its session and approval policies. The hosted Cloudflare Worker requires its own explicit SAM/native host bindings; a D1 tool record alone is not an executor.

## Python is a first-class SDK participant

The PyPI distribution is **`agentsam-sdk`**; the Python namespace is `agentsam_sdk`. The SDK source includes `agentsam_sdk.procedures.ProcedureClient` and native OCCT/FreeCAD host utilities. Check the currently published PyPI wheel before making an installed Python release a procedure dependency.

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

The npm package is configured as public in `package.json`, but release availability and clean-install portability must be verified separately. Publishing a PyPI API or npm wrapper is not evidence that host installation, cloud bindings, or deployed execution have been completed.
