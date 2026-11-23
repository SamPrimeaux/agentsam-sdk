# Python CAD clients, service transport and durable jobs

The Python distribution is `agentsam-sdk`; the import namespace is `agentsam_sdk`. The local
Python SDK is stdlib-first and does not require Node for its native CAD discovery and FreeCAD/OCCT
proof paths. The npm/Node CLI and Python CLI both install an `agentsam` executable; check which one
is on `PATH` before following a command.

## `AgentSamClient` and `AsyncAgentSamClient`

The SDK exposes the existing host-owned CAD job lifecycle as `client.cad_jobs`. Bind it only to a
trusted authenticated host operation invoker:

```python
from agentsam_sdk import AgentSamClient, AsyncAgentSamClient

client = AgentSamClient(cad_job_invoker=authorized_host_operation)
job = client.cad_jobs.submit(
    project_id="project_123",
    workspace_id="workspace_123",
    engine="freecad",
    prompt="Build a parametric enclosure with mounting bosses",
)
result = job.wait(timeout=3600)

async_client = AsyncAgentSamClient(cad_job_invoker=authorized_host_operation)
job = await async_client.cad_jobs.submit(
    project_id="project_123",
    workspace_id="workspace_123",
    engine="openscad",
    prompt="Build a validated CSG bracket",
)
```

Without a host invoker, `cad_jobs` remains discoverable but fails closed with
`cad_job_host_not_configured`. The injected callback dispatches existing `cad.job.generate`,
`cad.job.status` and `cad.job.execute` operations. The SDK's existing `createCadHttpPorts().jobs`
adapter maps those operations to the authenticated CAD API routes and the existing
`agentsam_cad_jobs` records. It is not a raw shell, arbitrary subprocess, caller-supplied account ID
or Node stdio escape hatch. The host retains identity, project/workspace scope, approval, runner
dispatch and persistence. There is no second queue or local job table. The async facade delegates
blocking host calls off the event loop.

## Authorized PrimeTech source inventory

For a bounded read-only inventory of native engineering source assets, reuse the existing
`repo.asset.inventory@0.1.0` procedure through `AgentSamClient.assets.inventory()`:

```python
from agentsam_sdk import AgentSamClient

client = AgentSamClient(procedure_invoker=authorized_host_procedure)
receipt = client.assets.inventory()
```

The authenticated PrimeTech procedure host owns scanning, path policy, hashing, truncation and the
deterministic JSON receipt. The Python SDK does not implement a second scanner or fall back to an
unauthenticated local shell. `inventory_native()` is a compatibility alias; prefer `inventory()`.
The specialist `cad.motor-bearing-end-plate` procedure is a review candidate; CAM outputs remain
simulation/review evidence, not approved machine-control instructions.

## `CadServiceClient`

`agentsam_sdk.cad.CadServiceClient` is the stdlib-only authenticated provider transport. It is for
short provider operations and files, not durable jobs. It:

- Discovers authenticated capabilities and only invokes operations the provider advertises.
- Uses typed errors with stable code, HTTP status, retryability, request ID and details.
- Requires HTTPS by default; plain HTTP is limited to loopback unless explicitly configured.
- Resolves mount-relative file refs through operator-authorized service mounts; caller paths are
  never treated as arbitrary host paths.
- Streams file-backed downloads with bounded memory, HTTP Range resume, byte-count/SHA-256
  verification and atomic promotion. `download()` is for small inline artifacts; use
  `download_to()` for large outputs.
- Streams uploads, hashes incrementally and verifies supplied digests before atomic replacement.

POST operations are not blindly retried. The caller must use the operation's idempotency contract;
replaying a build or write can create duplicate work.

## Service limits

- Inline JSON/base64 artifacts: 25 MiB maximum.
- File-backed artifacts: configurable `AGENTSAM_CAD_MAX_ARTIFACT_BYTES`, 2 GiB default and 16 GiB
  hard maximum.
- File GET supports HEAD and byte ranges; downloads can resume. File PUT streams to a temporary
  file and promotes atomically after validation.
- The client verifies the digest and byte count from the source receipt after transfer. HTTP 200
  alone is not proof that an artifact is correct.

## `CadBuildingClient` compatibility boundary

`CadBuildingClient` remains a compatibility wrapper for the experimental
`agentsam.cad.building-export.v1` rectangular-building proof. It checks explicit runtime readiness
and binds its receipt to the exact source mount/path/hash/revision. It does not make an installed
handler or binary count as proof, and it is not the general v2 project or durable-job API. The
current provider advertises `requires-runtime-proof`; treat it as unavailable until a verified host
changes that state.

## Source and release boundary

These APIs are source functionality on the branch that contains them. The Python source version is
read from `agentsam_sdk.__version__`; do not assume an already-installed PyPI wheel contains a new
API until the matching version is published and a clean wheel install has been tested.
