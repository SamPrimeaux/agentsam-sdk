# Client CMS Editor

The SDK development authority for the portable CMS authoring application is now:

```text
apps/client-cms-editor/
```

It was imported from the Inner Animal Media mirror at `packages/client-cms-editor/` and normalized into one independent npm workspace root with `frontend/`, `backend/`, and `shared/cms/` packages. The exact donor commit is recorded in `apps/client-cms-editor/IMPORT_PROVENANCE.json`.

The full platform CMS server/domain is **not** duplicated here. It remains in `inneranimalmedia/src/core/agentsam/cms/` until that domain is deliberately extracted into reusable SDK `packages/agentsam-cms-*` packages.

CMS AgentSam UI must consume `@inneranimalmedia/agentsam-workbench` and `@inneranimalmedia/agentsam-contracts`. `CmsEditor` accepts an optional authenticated `agent` configuration; when supplied by a host it exposes the shared AgentSam surface with explicit site/page/section/block context. When the host does not supply a real adapter and principal, the editor does not fabricate an AgentSam runtime.

See `docs/CMS_STUDIO.md` for authoring/public-runtime and Cloudflare binding boundaries.
