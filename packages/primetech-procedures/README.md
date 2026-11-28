# PrimeTech Procedures — Creative Engineering Execution

**Portable, versioned, deterministic workflows that turn an authored technical decision into real, verifiable artifacts.**

PrimeTech Procedures is **not** another agent, scheduler, terminal, shell provider, data registry or creative app. It is an engineering workflow layer using existing AgentSam/SAM authorization, operation routing and receipts. Procedures should be reusable by standalone app installers, the desktop host, the Cloudflare host and the Python/TypeScript SDKs without copying their source.

## Package and plugin distribution

- `agentsam.package.json` is the AgentSam package-install manifest and is included in the npm tarball.
- `plugin.json` is the portable Agent Plugins 1.0 manifest. It packages the same nine canonical `skills/` workflows for OpenAI-compatible skill hosts; implicit skill invocation is enabled in `agents/openai.yaml`.
- The `skills/` directory is the single source of truth. AgentSam-specific `agentsam.skill.json` metadata remains beside each portable `SKILL.md`; the OpenAI plugin consumes those same `SKILL.md` files rather than maintaining a second copy.
- The OpenAI distribution is intentionally skills-first and has no `mcp.json`: it does not advertise a remote PrimeTech tool server that does not yet exist. ChatGPT uses the host's available tools; the local AgentSam CLI remains the execution host for the packaged procedure runner. Build an approval-ready plugin update archive with `python3 scripts/package-openai-plugin.py`.
- The official AgentSam remote plugin-catalog listing is a separate product lifecycle and is not claimed by this npm package manifest.

TypeScript consumers can import the typed root API or the typed `./skills` subpath:

```ts
import { createProcedureCatalog, createPrimeTechProcedureHandler } from '@inneranimalmedia/primetech-procedures';
import { getPrimeTechSkill } from '@inneranimalmedia/primetech-procedures/skills';
```

### AgentSam SDK and CLI

The AgentSam SDK consumes this npm package as the single canonical source for the nine PrimeTech skills; it does not vendor a second copy of their instructions. The SDK's `skills/catalog.json` points into the installed npm dependency.

```sh
# List and load the nine PrimeTech skills already bundled with the SDK
agentsam skills
agentsam skills primetech-design-systems

# Register all nine package skills in the user's local slash-skill registry
agentsam skill install @inneranimalmedia/primetech-procedures
agentsam skill list
```

`agentsam skills` reads the SDK's built-in catalog. `agentsam skill install` imports every `skills/<id>/agentsam.skill.json` entry from a multi-skill npm package into `~/.agentsam/skills/`; both paths read the same packaged `SKILL.md` files.

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

## Creative production extension

The package now includes a real creative-production runtime, not just category names. The new procedures are versioned, schema-validated, bound to the local project root, and invoked through the existing PrimeTech procedure runner.

| Procedure | Production result |
|---|---|
| primetech.icon-family.build | 24 editable SVG variants across three shapes and eight named colorways, plus PNGs at requested raster sizes and a checksummed manifest |
| primetech.typeface.package | Validated Typeface Studio source, reparsed static TTF, specimen HTML, and source package |
| primetech.sprite-atlas.build | Transparent PNG atlas, ordered frame metadata, and a controllable HTML preview |
| primetech.visuals.compare | PNG diff and overlay, pixel metrics, and a machine-readable evidence report |
| primetech.design-system.package | Validated token source, CSS variables, contrast results, and documentation |
| primetech.assets.package | ZIP handoff with source hashes, metadata, and a delivery manifest |
| primetech.ebook.package | Validated EPUB 3 archive, navigation, HTML preview, and publication manifest |
| primetech.production-board.manage | Revisioned production board with idempotent generation receipts, quality gates, retries, and resumable failures |

## Packaged AgentSam skills

Nine authored skills ship with the package. Each has an agentsam.skill.v1 manifest and a complete SKILL.md workflow with trigger conditions, inputs, prerequisites, production steps, artifact contract, quality gates, persistence, iteration, handoff and failure handling.

| Skill | Slash trigger | Focus |
|---|---|---|
| PrimeTech Brand Kit Development | /primetech-brand-kit | Creative direction and complete identity systems from a focused brief |
| PrimeTech Iconography | /primetech-iconography | Develop, refine, remaster and compare marks and icon families |
| PrimeTech Type Design | /primetech-type-design | Custom letterforms, glyph systems and static font production |
| PrimeTech Character and Sprites | /primetech-character-sprites | Pet and character identity sheets, 2D sprites, 3D companions and animation |
| PrimeTech Design Systems | /primetech-design-systems | Semantic tokens, accessible palettes and reusable UI foundations |
| PrimeTech UI/UX Prototypes | /primetech-ui-ux-prototypes | High-fidelity responsive flows and runnable demos in the actual codebase |
| PrimeTech Visual QA | /primetech-visual-qa | Reference comparison, pixel evidence and semantic design review |
| PrimeTech Creative Delivery | /primetech-creative-delivery | Source-preserving, checksummed creative handoff packages |
| PrimeTech Digital Publishing | /primetech-digital-publishing | Structured content to validated EPUB 3 |

The skills reference real existing AgentSam tools for image generation, illustration, Excalidraw, browser capture, Meshy and MovieMode. The local packaging procedures are registered as SAM operations and are called through the versioned primetech.procedure.run capability. Meshy remains the existing provider integration; this package does not create a second Meshy client.

## Format and delivery matrix

| Creation | Inputs | Verified outputs | Current boundary |
|---|---|---|---|
| Brand marks and icon families | Approved SVG master and named colorways | SVG family, PNG raster sizes, preview metadata, checksums | Raster concepts are not treated as vector masters |
| Custom type | Typeface Studio source JSON and glyph contours | Static TTF, source JSON, specimen HTML, ZIP | Variable fonts are not produced by this exporter |
| Character sprites | Ordered frame images and animation settings | Transparent PNG atlas, frame JSON, HTML preview | Atlas packaging does not itself generate or rig character frames |
| Visual QA | Matching reference and rendered images | PNG diff, PNG overlay, pixel metrics, report | Pixel similarity is separate from semantic UX/accessibility review |
| Design systems | Token JSON | CSS variables, contrast evidence, documentation and manifest | Tokens must still be adopted by the target product to count as implemented |
| Creative delivery | Approved project-relative files | ZIP, source inventory, checksums and manifest | Remote upload is a separate approved storage step |
| Digital publishing | Structured publication source | EPUB 3, navigation, HTML preview and manifest | PDF, DOCX, print layout and DRM are not claimed by this EPUB workflow |
| UI/UX flows and demos | Actual repository, journey and acceptance criteria | Runnable application changes, routes, browser captures and tests | A flow diagram or static mockup alone is not accepted as a demo |
| 3D characters and motion | Character references and provider-supported task inputs | Meshy model/rig/animation results and MovieMode renders/exports | Exact formats are reported from the provider task result, not guessed |

## Runtime integration and authorization

The local SDK shell installs the eight creative SAM operations. Write-capable operations are deliberately not listed as standalone model tools. The model calls the versioned procedure runner; the runner validates the manifest and input, requests the workflow.execute approval, then invokes the exact installed SAM operation through a private host path. The caller cannot choose a project root or submit arbitrary shell commands.

The generic procedure capability is available in the local AgentSam CLI. The separate Cloudflare D1 tool row for primetech.procedure.run remains inactive because a Worker-native handler for Node filesystem and native image/font packaging has not been implemented. The active D1 skill records can guide AgentSam chat, and the existing cloud image, illustration, Meshy and MovieMode tools remain their own registered tools; this does not falsely claim that local filesystem packaging is already available to remote Work.

The nine existing skill rows are active in the account-scoped `agentsam_skill` registry and use R2-backed Markdown bodies. Their current production metadata points to the published `@inneranimalmedia/primetech-procedures@2.6.19` package. The next package release is staged as 2.6.20 to correct the embedded `agentsam.package.json` version; it reuses the same nine skill rows and unchanged skill bodies. After that release is published, update the existing rows' package-version metadata in place—do not create duplicate skill or revision records.

## Build, validate and release

- Run the complete package suite with npm test.
- Regenerate packaged skills with npm run generate:skills.
- Regenerate procedure manifests with npm run generate:procedures.
- npm pack runs the test suite through prepack before creating a release archive.
- The package is not published from a feature branch. Follow the manual release-from-main policy after merge and acceptance; then attach the published npm package name/version to the D1 skill records.

The current package suite covers the original runtime plus creative builders, production-board persistence, AgentSam skill validation and the private SAM procedure invocation path. A successful local test run is not a claim that the package has been published or deployed to the remote Worker.
