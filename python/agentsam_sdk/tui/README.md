# Agent Sam TUI

Optional terminal presentation for the Python `agentsam` CLI.

**Ownership:** UI only. This package is not an Agent Sam tool, tool registry,
execution adapter, workflow, or permission boundary. It renders state produced
by real SDK commands.

Migrated from `inneranimalmedia/tools_py/agentsam_tui` so the product repo no
longer presents a TUI prototype as a reusable runtime tool.

```bash
cd python
pip install -e '.[tui]'
agentsam tui
agentsam tui --scene dashboard
agentsam tui --check
```

The core Python SDK remains stdlib-only; `rich` is an optional extra.

For a zero-dependency Node/ANSI rendering reference, see `../../../../examples/agentsam-tui-ansi.mjs`.
