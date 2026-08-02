# agentsam_sdk (Python)

Stdlib-first Agent Sam tooling — portable audits and inventory that IAM (and any checkout) can call without copying one-off scripts.

## Install (editable)

```bash
cd agentsam-sdk/python
python3 -m pip install -e .
# or: PYTHONPATH=$PWD python3 -m agentsam_sdk.repository.inventory --json
```

## Modules

| Import | Purpose |
|--------|---------|
| `agentsam_sdk.repository.inventory` | Repo file counts + sizes by logical category |
| `agentsam_sdk.runtime.contract` | `ToolInput` / `ToolResult` + receipt envelope |

## Inventory CLI

```bash
python3 -m agentsam_sdk.repository.inventory
python3 -m agentsam_sdk.repository.inventory --json
python3 -m agentsam_sdk.repository.inventory --root /path/to/repo --top 25
# after pip install -e .:
agentsam-repo-inventory --json
```

Mode is always `read-only`. No secrets, no D1.

IAM thin shim (same flags): `inneranimalmedia/scripts/repo-size-inventory.py` resolves this package via `AGENTSAM_SDK_ROOT` or a sibling/`~/agentsam-sdk` checkout.
