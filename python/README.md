# agentsam-sdk (Python)

The Python SDK ships with a built-in Rich terminal experience and its existing
Geaux companion art. It is the default `agentsam` experience, not a separate
`[tui]` product or installation.

```bash
pip install --upgrade agentsam-sdk
agentsam                       # interactive home (TTY only)
agentsam doctor                # installed SDK and runtime overview
agentsam doctor --verify-cad   # real OCCT solid/export/reopen proof, if installed
agentsam repository inventory --repo-root . --format json
```

Requires Python 3.10+. Data-only commands never open an interactive prompt.
Human-facing terminal chrome goes to stderr; JSON goes to stdout, including when
piped. Set `NO_COLOR=1` or use `agentsam --plain <command>` for plain text.

Source-asset inventory is exposed through the existing authorized PrimeTech
procedure host. The Python package does **not** duplicate its scanner or invent
an unauthenticated local shell fallback.

```python
from agentsam_sdk import AgentSamClient

# The trusted host supplies procedure_invoker and project/identity scope.
client = AgentSamClient(procedure_invoker=authorized_sam_invoker)
receipt = client.assets.inventory()
# Async: await async_client.assets.ainventory()
```

Without a bound procedure host, inventory refuses with the existing
`sam_procedure_host_not_configured` error instead of guessing.

For local development: `cd python && pip install -e .` then
`python -m unittest discover -s tests -v`.

### `AgentSamClient.invoke()`

Workspace, repository inspection, hook execution, and the bounded native process
runtime work in Python **without Node**. D1 audit commands are separate: their
current D1Adapter invokes Wrangler and therefore need the appropriate installed
Cloudflare/Node tooling. The Node bridge is an optional interoperability path,
not a required Python SDK runtime.

If Node 20+ and the npm AgentSam SDK are installed, the Python client can also
invoke **explicitly opted-in Core SAM operations**:

```bash
npm install @inneranimalmedia/agentsam-sdk
```

```python
from agentsam_sdk import AgentSamClient

client = AgentSamClient(cwd=".", bridge_timeout_seconds=300)

# Python-native; works when Node is absent.
local = client.invoke("workspace.list", {"path": ".", "depth": 1})

# Optional JS bridge; requires Node/npm installation.
status = client.invoke("arch.capabilities.status", {})
assert status["ok"] is True
```

Bridge exposure comes from the canonical operation's `interop.stdio` contract
(`pure`, `workspace_read`, or local `decision`), with fail-closed
execution-policy checks. It is not an independent tool registry: the bridge
discovers permitted operations in `createSamOS()`. It deliberately does not
accept terminal, D1, CMS, arbitrary subprocess, or host-privileged operations.
An operation must have its real authorized host configured to run outside this
local compatibility transport.

Set `bridge_timeout_seconds` per client, or
`AGENTSAM_BRIDGE_TIMEOUT_SECONDS` (1–3600 seconds). This affects only
bridge-backed operations; it is not a general AgentSam job timeout.
Without Node/the bridge, Python-native `invoke()` operations continue working,
while JS-only operations return `sam_node_required` or
`sam_bridge_not_installed`.


Protocol: [`../protocol/README.md`](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/protocol/README.md). 

## Optional OpenCV video inspection

The model-independent SAM media engine supports optional OpenCV for video frame sampling and visual-change scores. Install it in an isolated Python environment with `pip install -e '.[opencv]'` from `python/`. The regular Python SDK remains usable without NumPy or OpenCV. Use `agentsam_sdk.media.inspect_video()` for trusted local scripts; AgentSam's authenticated SAM host exposes `media.video.inspect` and `media.video.sample_frames` against existing owned media assets, when this optional engine is installed. See [SAM OpenCV media inspection](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/docs/sam/opencv-media.md) for setup, permissions, limits, and end-to-end examples.

## Portable lifecycle hooks

`agentsam_sdk.hooks` implements the same `agentsam.hook.v1` envelope as the
JavaScript/TypeScript, Go, Rust, command, and HTTP adapters. It is stdlib-only:

```python
from agentsam_sdk.hooks import HookRuntime

hooks = HookRuntime()
hooks.register("pre_tool_use", lambda envelope: {
    "permission_decision": "allow"
})
result = await hooks.dispatch("pre_tool_use", {
    "tool_name": "repository.snapshot", "tool_args": {}
})
```

See [`../packages/agentsam-hooks/README.md`](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/packages/agentsam-hooks/README.md)
for composition, permission, and subprocess transport rules.

## Optional sibling packages (not part of stdlib core)

| Package | Path | Notes |
|---------|------|-------|
| `agentsam-site-scrape` | [`../packages/agentsam-site-scrape/`](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/packages/agentsam-site-scrape/) | Optional/network (`requests`); crawl→R2. Dual-homed with IAM `tools/agentsam-site-scrape/`. Does **not** fold into `agentsam_sdk`. |


## Built-in terminal renderer

The existing Rich renderer and Geaux assets are installed by default.
`agentsam_sdk.tui` is the shared presentation library and a developer
preview, not a separate CLI executable, operation registry, or execution host.

```bash
python -m agentsam_sdk.tui --scene dashboard --check
```

## Portable CAD host adapter (macOS, Windows, Linux)

The Python SDK owns FreeCAD host discovery, native execution
environment and kernel-proof receipts, **not geometry modeling**. The native
FreeCAD/OpenCascade kernel remains authoritative. A located executable does
not count as a ready engine until the real B-Rep solid validity/volume probe
succeeds.

```bash
python -m agentsam_sdk.cli cad doctor --engine all
```

For nonstandard installations set `AGENTSAM_FREECAD_HOME` or
`AGENTSAM_FREECAD_PYTHON`; optionally `AGENTSAM_FREECAD_LIB`.
The SDK exposes `discover_freecad()`, `FreeCADHost.environment()` and
`probe_freecad()` to CAD service hosts. It also exposes `discover_occt()` and
`probe_occt()`, which execute the published C++ OCCT binary through real
STEP export and reopen. Override with `AGENTSAM_OCCT_BIN` if needed. Windows PowerShell is a supported
invocation shell, not a geometry runtime. Host-specific execution must
remain argv-based and never concatenate untrusted shell commands.

## Native runtime and PrimeTech procedures

The Python client now dispatches shared workspace file operations and bounded argv process execution natively. These operations do not require Node or the JavaScript bridge. Writes require the explicit write flag and a trusted host approval callback; the workspace root and receipt directory come from host configuration, never tool input.

The native process runner uses an executable plus an argument vector, an allowlisted environment, a workspace-scoped working directory, process-group termination, output and timeout bounds, redaction, and a receipt for successful and refused calls. It is not a security sandbox; untrusted code must use a separately authorized isolated runtime.

D1 writes are intentionally different: they go through the existing D1Adapter only. That adapter uses the installed Wrangler/Node toolchain and requires an explicitly configured database UUID matching the requested target. The Python filesystem and process capabilities remain usable without Node; D1 mutation is unavailable when its existing adapter is not bound.

AgentSamClient.procedures.run(id, version, input) and its async arun counterpart delegate to an explicitly injected trusted host procedure operation. They do not launch shell commands or create another procedure registry. The host-owned PrimeTech handler validates the pinned manifest, invokes the existing sam.superbash operation, and writes output artifacts and receipts to the configured receipt directory.

## Native asset inventory (PrimeTech procedure API)

The SDK source exposes a first-class `AgentSamClient.assets` facade. It does not reimplement the engineering scanner or execute shell commands.

```python
from agentsam_sdk import AgentSamClient

client = AgentSamClient(procedure_invoker=authenticated_host_invoker)
verified_receipt = client.assets.inventory_native()
```

Async hosts can use `await AsyncAgentSamClient(...).assets.ainventory_native()`. The existing host-owned `repo.asset.inventory@0.1.0` procedure owns native source discovery and hashing, while `ProcedureClient` validates its receipt.

This is source functionality until the matching clean Python wheel is published to PyPI. The source version is read from `agentsam_sdk.__version__`; do not assume an installed wheel includes a newly added API until that exact version is published and tested from a clean install.


## CAD service transport and durable jobs

The standard-library-only module agentsam_sdk.cad.CadServiceClient handles
authenticated provider capabilities, bounded native-engine requests,
mount-relative file references, and streamed, resumable artifact downloads.
Use download_to() for large files; download() intentionally refuses artifacts
above its configured inline limit.

The old CadBuildingClient remains a compatibility wrapper for the experimental
rectangular-building proof endpoint. It is not the general CAD project API, and
it will not report that endpoint ready while the provider says
requires-runtime-proof.

Long-running project work uses the host-owned CAD job operations rather than
holding one provider HTTP request open:

~~~python
from agentsam_sdk import AgentSamClient

# The host supplies a trusted, authenticated SAM operation invoker.
client = AgentSamClient(cad_job_invoker=authorized_host_invoke)
job = client.cad_jobs.submit(
    project_id="project_123",
    workspace_id="workspace_123",
    engine="freecad",
    prompt="Build a parametric enclosure with mounting bosses",
)
result = job.wait(timeout=3600)
~~~

The host adapter dispatches the existing cad.job.generate, cad.job.status, and
cad.job.execute operations and owns project authorization, approvals, runner
dispatch and agentsam_cad_jobs persistence. The existing SDK `createCadHttpPorts().jobs`
adapter maps the SAM operations to the authenticated CAD API; the host supplies the
trusted invoker. AgentSamClient exposes the existing client as `client.cad_jobs`; without a trusted invoker it fails closed with
`cad_job_host_not_configured`. AsyncAgentSamClient exposes the nonblocking
`async_client.cad_jobs` facade. The Python SDK creates no parallel job table or
local queue. See the
[Python CAD transport architecture](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/docs/architecture/PYTHON_CAD_SERVICE_TRANSPORT.md).
