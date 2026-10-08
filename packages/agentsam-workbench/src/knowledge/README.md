# Portable AutoRAG workflow dialog

`@inneranimalmedia/agentsam-workbench/knowledge` exports `AutoRagWorkflowDialog` and the `AutoRagWorkflowHost` interface. Import `@inneranimalmedia/agentsam-workbench/knowledge/autorag-workflow.css` alongside the component.

Host responsibilities (never inside the component):

- `inspect(root)`: return the real `agentsam.autorag.workflow.v1` discovery, historical generation and verification receipt.
- `configure(root,{scope,provider,backend,model,dimensions})`: preserve the project's own provider/backend authority, validate sources, and save only on explicit confirmation.
- `execute(root,{semantic,allowPaid})`: run the actual project-selected indexing pipeline and return `agentsam.autorag.execution.v1` with source-grounded hits. Never return `verified:true` for a skipped or merely declared resource.
- `pickRoot?()`: optional host-owned directory chooser; a browser cannot grant itself access to filesystem paths.

The component intentionally contains no Cloudflare, Supabase, node, Tauri, database, secrets, file-system or user-identity logic. A host that cannot execute a selected remote lane must reject instead of silently writing a local index.

The shipped Local Studio Desktop adapter uses allowlisted Tauri native commands that invoke the locally installed AgentSam CLI with argv (no shell). It does not request an `AGENTSAM_BRIDGE_KEY`. The hosted web view does not claim it can inspect a local filesystem without a connected terminal host.
