# agentsam-sdk (Python)

Core repository/data commands remain **stdlib-only** (`dependencies = []`).
Rich is an optional renderer dependency used by the SDK's internal terminal preview lab;
it is not exposed as an installed-user renderer command.

```bash
pip install agentsam-sdk            # stdlib-only core
pip install "agentsam-sdk[tui]"     # optional Rich terminal renderer
agentsam repository inventory --repo-root /path/to/repo --format json
```

Requires Python 3.10+. For development from a checkout: `cd python && pip install -e .`
then `python -m unittest discover -s tests -v`.

### `AgentSamClient.invoke()`

The repository, data, hooks and `agentsam` CLI tools run entirely in Python. The local
SAM client (`AgentSamClient`) delegates to the Node SAM kernel, so it needs Node 20+ and
the npm package in the project or a parent directory:

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


## Internal Rich renderer preview

The npm SDK owns the public interactive experience. For renderer development only:

```bash
cd ..
npm run ui:preview -- tour
npm run ui:preview -- thinking
```

The Python module can also be invoked directly after installing the optional extra:

```bash
cd python
pip install -e '.[tui]'
PYTHONPATH=. python -m agentsam_sdk.tui --scene dashboard --check
```

`agentsam_sdk.tui` is presentation-only. It does not define tools, execution policy, or public CLI vocabulary.


## Native runtime and PrimeTech procedures

The Python client now dispatches shared workspace file operations and bounded argv process execution natively. These operations do not require Node or the JavaScript bridge. Writes require the explicit write flag and a trusted host approval callback; the workspace root and receipt directory come from host configuration, never tool input.

The native process runner uses an executable plus an argument vector, an allowlisted environment, a workspace-scoped working directory, process-group termination, output and timeout bounds, redaction, and a receipt for successful and refused calls. It is not a security sandbox; untrusted code must use a separately authorized isolated runtime.

D1 writes are intentionally different: they go through the existing D1Adapter only. That adapter uses the installed Wrangler/Node toolchain and requires an explicitly configured database UUID matching the requested target. The Python filesystem and process capabilities remain usable without Node; D1 mutation is unavailable when its existing adapter is not bound.

AgentSamClient.procedures.run(id, version, input) and its async arun counterpart delegate to an explicitly injected trusted host procedure operation. They do not launch shell commands or create another procedure registry. The host-owned PrimeTech handler validates the pinned manifest, invokes the existing sam.superbash operation, and writes output artifacts and receipts to the configured receipt directory.
