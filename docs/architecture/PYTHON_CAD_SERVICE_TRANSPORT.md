# Python CAD service transport and durable job boundary

## Decision

The Python CAD SDK exposes two deliberately separate client surfaces:

- **`CadServiceClient`** is an authenticated provider transport for short operations, capability
  discovery, mount-relative files and verified artifact transfer.
- **`CadJobClient`** delegates long-running project work to the host's existing SAM operations:
  `cad.job.generate`, `cad.job.status` and `cad.job.execute`.

`AgentSamClient.cad_jobs` and `AsyncAgentSamClient.cad_jobs` expose that existing job client. The
host remains the authority for principal resolution, project/workspace authorization, approval,
runner dispatch and `agentsam_cad_jobs` persistence. The Python SDK creates no queue, local job
database or alternate job table.

## Existing source and result contracts

- `cad.project.v2` is the canonical portable project contract and schema. The local Node
  `agentsam cad project` file-store runtime remains a legacy v1 path; this transport PR does not
  claim to make that local runtime a full v2 authoring system.
- CAD operation intent and authorization remain in the existing SAM CAD pack.
- Durable job identity and lifecycle remain in the host-owned CAD job port.
- The general CAD project pipeline uses the canonical artifact receipt and delivery-manifest
  contracts: source/project revision, operation, executor/version, artifact URI, byte count, digest
  and validation evidence. The experimental building proof retains its operation-specific v1
  receipt and is not a replacement for those contracts.
- File refs are mount-relative aliases. The service resolves them against operator-authorized
  mounts; callers cannot submit arbitrary host paths.

## Provider transport: `CadServiceClient`

`CadServiceClient` is standard-library-only. It imports no Node runtime or geometry engine. It
provides:

- Authenticated capability discovery with a short cache and explicit refresh.
- Operation dispatch only when the provider advertises that operation.
- Typed errors with stable code, HTTP status, retryability, request ID and details.
- HTTPS by default. Plain HTTP is accepted only for loopback unless an operator explicitly opts in.
- Mount-relative file listing and strict resource-reference validation.
- `download_to()` for file-backed output. It streams in bounded chunks, supports HTTP byte-range
  resume, verifies complete byte count and SHA-256, and atomically promotes the verified file.
- `download()` for small inline artifacts only; larger artifacts must use `download_to()`.

POST operations are not automatically retried. A retry must follow the operation's idempotency
semantics; blindly replaying a build or write can create duplicate work.

## Durable jobs: `AgentSamClient.cad_jobs`

Bind the facade to a trusted invoker supplied by the authenticated host integration:

~~~python
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
~~~

The invoker dispatches the existing SAM operation IDs; it is not a raw HTTP endpoint, shell
executor, caller-controlled account ID or stdio bridge. Without an invoker, the facade remains
available but fails closed with `cad_job_host_not_configured`. The async facade delegates blocking
host calls off the event loop. There is no client-side cancel operation until the host exposes a
canonical cancel operation.

## Compatibility boundary: `CadBuildingClient`

`CadBuildingClient` remains a backwards-compatible wrapper for the experimental
`agentsam.cad.building-export.v1` rectangular-building proof. Its nine required outputs are a
profile for that proof, not a universal CAD artifact list.

The building endpoint advertises `requires-runtime-proof`. The client reports service reachability
separately from operation readiness and refuses to claim the building operation is ready until the
host supplies explicit runtime proof. It binds the receipt to the exact source mount/path/hash/
revision. An installed handler or binary alone is not proof. The endpoint remains synchronous and
bounded by the existing 120-second execution limit; it is not the general durable CAD job API.

## Artifact transfer limits

- Inline JSON/base64 artifacts: 25 MiB maximum.
- File-backed artifacts: configurable `AGENTSAM_CAD_MAX_ARTIFACT_BYTES`, 2 GiB default and 16 GiB
  hard maximum.
- File downloads stream from disk, advertise byte ranges, and support HEAD and resumable Range
  requests.
- Uploads stream to a temporary file, hash incrementally, verify an optional supplied digest and
  atomically replace the destination.

The client verifies the digest and byte count from the source receipt after transfer. HTTP success
is not a substitute for artifact verification.

## Acceptance

Run:

~~~bash
npm run verify:cad-building
npm run test:python
npm run verify:cad-python
~~~

Acceptance covers endpoint and resource-ref security, provider operation readiness, source-linked
receipt validation, inline-size rejection, resumed artifact downloads, host-owned job
submit/status/execute, and HTTP HEAD/Range/streamed PUT behavior.
