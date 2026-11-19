# Agent Sam Rich renderer lab

Internal high-fidelity terminal presentation experiments for Agent Sam. This package is a renderer/design surface, not a public user command, tool registry, execution adapter, workflow, or permission boundary.

The Python CLI and installed npm CLI use shared presentation tokens where possible. Users type `agentsam`; they do not select ANSI versus Rich.

From the SDK repository, preview scenes with:

```bash
npm run ui:preview -- tour
npm run ui:preview -- boot
npm run ui:preview -- setup
npm run ui:preview -- thinking
npm run ui:preview -- ready
```

The Node script selects the renderer internally. For direct Python renderer work:

```bash
cd python
pip install -e .
PYTHONPATH=. python -m agentsam_sdk.tui --scene dashboard --check
```

The Python algorithms remain stdlib-first, but `rich` is now installed as a default CLI dependency. The intended product progression is small: **brand/boot → detect project context → first-run keyboard choices when needed → quiet ready prompt**.

For the zero-dependency Node/ANSI animation lab, see `../../../../scripts/internal/ansi-ui-preview.mjs`.
