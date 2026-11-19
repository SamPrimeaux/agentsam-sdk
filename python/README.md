# agentsam-sdk (Python)

The Python SDK ships with a built-in Rich terminal experience and its existing
Geaux companion art. It is the default `agentsam` experience, not a separate
`[tui]` product or installation.

```bash
pip install --upgrade agentsam-sdk
agentsam                       # interactive home (TTY only)
agentsam doctor                # installed SDK and runtime overview
agentsam doctor --verify-cad   # real OCCT solid/export/reopen proof, if installed
agentsam assets inventory .    # CAD, scene, drawing, media and toolpath file discovery
agentsam assets inventory . --hash --format json
agentsam repository inventory --repo-root . --format json
```

Requires Python 3.10+. Data-only commands never open an interactive prompt.
Human-facing terminal chrome goes to stderr; JSON goes to stdout, including when
piped. Set `NO_COLOR=1` or use `agentsam --plain <command>` for plain text.

Native asset inventory is deterministic, scoped to the selected project root,
never follows symlinks, and can hash files using SHA-256. File presence **does not
prove** geometric integrity or machine readiness.

```python
from agentsam_sdk import AgentSamClient

client = AgentSamClient(cwd="/path/to/project")
assets = client.assets.inventory(include_hashes=True)
```

For local development: `cd python && pip install -e .` then
`python -m unittest discover -s tests -v`.

### `AgentSamClient.invoke()`

Repository, data, hooks, workspace, bounded argv execution, and native
asset inventory work in Python without Node. Other `AgentSamClient.invoke()`
operations still delegate to the existing Node SAM kernel, requiring Node 20+
and the npm SDK available to that authorized host:

```bash
npm install @inneranimalmedia/agentsam-sdk
```

The bridge is found automatically from the working directory. It is read-only by design:
write, D1, CMS and terminal operations are refused (`sam_bridge_operation_not_allowed`).
Without the npm package, `invoke()` raises `sam_bridge_not_installed`.


Protocol: [`../protocol/README.md`](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/protocol/README.md). 

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
