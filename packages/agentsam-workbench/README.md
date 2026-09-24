# @inneranimalmedia/agentsam-workbench

Reusable React workbench primitives built on `@inneranimalmedia/agentsam-contracts`.

This is the shared AgentSam UI layer for Local Studio, CAD Studio, and CMS Studio. It provides controlled/headless primitives for agent threads and composition, model selection, tool/artifact receipts, browser frames, terminal surfaces, and resizable shell panels. Product apps inject their own state, routing, auth, tools, runtime adapters, and visual treatment.

Current proof consumer: `apps/local-studio/`. Local Studio now delegates its composer, thread scroll behavior, and split-handle behavior to this package while retaining product-specific styling and state.

`packages/agentsam-shell-kit` remains only as a compatibility facade for older imports.
# Floating annotation helper

`MiniAgentSam` is exported from `@inneranimalmedia/agentsam-workbench/agent`.
Import `@inneranimalmedia/agentsam-workbench/agent/mini-agentsam.css` once in the host.
The host controls `selecting`, `onSelectingChange`, `onSubmit(prompt, selection)`,
and an optional `renderComposer` slot. Use `scope()` to restrict selection to a
particular root. No network, storage, plugin registry, or application dependency
is built into the helper. It inherits `--nav-*` tokens; other hosts can supply
`--mini-surface`, `--mini-text`, `--mini-muted`, `--mini-border`, and `--mini-accent`.

Selections are bounded descriptive DOM context and never authorize edits. Input
values are withheld. Cross-origin and sandboxed iframe contents are not inspected;
their host frame may be selected as a contextual resource. Mark semantic ancestors
with `data-agentsam-resource` and excluded controls with `data-annotation-control`.
Local Studio stages the annotation in its active conversation draft for review.
