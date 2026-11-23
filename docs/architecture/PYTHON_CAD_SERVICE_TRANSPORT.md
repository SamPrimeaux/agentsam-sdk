# Python CAD service transport and durable job boundary

## Decision

The Python CAD SDK has two deliberately separate client surfaces:

- **CadServiceClient** is a provider transport. It inspects authenticated capabilities, invokes short native-provider endpoints, lists mount-scoped files, and streams verified artifacts.
- **CadJobClient** delegates durable project work to the host's existing SAM CAD operations: **cad.job.generate**, **cad.job.status**, and **cad.job.execute**.

The host remains the authority for OAuth principal resolution, project/workspace authorization, write approval, Queue Control, runner selection, and the existing **agentsam_cad_jobs** records. The Python client does not create a queue, local job database, or alternate job table.

## Existing source and result contracts

- Editable source remains **cad.project.v2**; the building proof reads a bounded subset of that model and does not create a second project format.
- CAD operation intent and authorization remain in the SAM CAD pack.
- Durable job identity and lifecycle remain in the host-owned CAD job port.
- Generated outputs must use the CAD artifact receipt and delivery-manifest contracts, including project/source revision, operation, executor, artifact URI, byte count, digest, and validation evidence.
- File refs are mount-relative aliases. The service resolves them against its own operator-authorized mounts; a caller cannot send an arbitrary host path.

## Client responsibilities

### Provider transport

CadServiceClient is standard-library-only and imports no Node runtime or geometry engine. It provides:

- Authenticated capability discovery with a short cache and explicit refresh.
- Operation dispatch only when the provider advertises that operation.
- Typed errors with stable error code, HTTP status, retryability, request ID, and details.
- HTTPS by default. Plain HTTP is accepted only for loopback unless an operator explicitly opts into insecure HTTP.
- Mount-relative file listing and strict resource-reference validation.
- download_to() for file-backed output. It streams in bounded chunks, supports HTTP byte-range resume, verifies the complete byte count and SHA-256, and atomically renames the verified partial file.
- download() only for small inline artifacts; larger outputs must use download_to().

POST operations are not automatically retried. A retry must be driven by the caller's idempotency semantics; blindly replaying a build or write can create duplicate work.

### Durable CAD jobs

Use CadJobClient when the operation may run beyond one HTTP request or needs durable status:

~~~python
from agentsam_sdk.cad import CadJobClient

jobs = CadJobClient(agent_sam.invoke)
job = jobs.submit(
    project_id="project_123",
    workspace_id="workspace_123",
    engine="freecad",
    prompt="Build a parametric enclosure with mounting bosses",
)
result = job.wait(timeout=3600)
~~~

The injected invoker must be the authenticated host SAM operation port. It is not a raw HTTP endpoint, and it must not be replaced with a caller-controlled account ID or direct D1 access. execute() calls the existing cad.job.execute operation; the host still performs its own authorization and approval checks. There is intentionally no client-side cancel operation until the host exposes a canonical cancel operation.

For async applications, AsyncCadJobClient wraps the same host port in asyncio.to_thread so polling does not block the event loop.

## Compatibility boundary

CadBuildingClient remains as a backwards-compatible wrapper for the experimental **agentsam.cad.building-export.v1** rectangular-building proof. Its required nine outputs are a profile for that proof, not a universal CAD artifact list.

The current building endpoint advertises **requires-runtime-proof**. The client therefore reports the service as reachable but refuses to claim the building operation is ready until the host changes that status to **available** or supplies an explicit verified proof. An installed handler or installed binary alone is not evidence that the complete export pipeline works.

The building proof endpoint remains synchronous and bounded by the service's existing 120-second execution limit. It is not the general long-running project job API. Use the host-owned CAD job operations for durable generation.

## Artifact transfer limits

The service separates inline JSON artifacts from file-backed artifacts:

- Inline JSON/base64 responses remain limited to 25 MiB.
- File-backed artifacts use a configurable AGENTSAM_CAD_MAX_ARTIFACT_BYTES ceiling (default 2 GiB, hard maximum 16 GiB).
- File downloads stream from disk, advertise byte ranges, and support HEAD and resumable Range requests.
- Uploads stream to a temporary file, hash incrementally, verify an optional supplied digest, and atomically replace the destination.

The client still verifies the digest from the source receipt after transfer. Server-side transport success is not a substitute for receipt validation.

## Acceptance

Run:

~~~bash
npm run verify:cad-building
npm run test:python
npm run verify:cad-python
~~~

Acceptance covers endpoint and resource-ref security, operation readiness, source-linked receipt validation, inline-size rejection, resumed artifact download, host-owned job submission/status/execute, and HTTP HEAD/Range/streamed PUT behavior.
