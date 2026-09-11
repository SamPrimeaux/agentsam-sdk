# @inneranimalmedia/agentsam-workbench

Reusable React workbench primitives built on `@inneranimalmedia/agentsam-contracts`.

This is the shared AgentSam UI layer for Local Studio, CAD Studio, and CMS Studio. It provides controlled/headless primitives for agent threads and composition, model selection, tool/artifact receipts, browser frames, terminal surfaces, and resizable shell panels. Product apps inject their own state, routing, auth, tools, runtime adapters, and visual treatment.

Current proof consumer: `apps/local-studio/`. Local Studio now delegates its composer, thread scroll behavior, and split-handle behavior to this package while retaining product-specific styling and state.

`packages/agentsam-shell-kit` remains only as a compatibility facade for older imports.
