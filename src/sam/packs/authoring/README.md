# SAM Universal Authoring operation pack

Install via `createSamOS({authoring:{compiler,repository,resolveTrustedContext,authorize}})`.
The compiler is the `@inneranimalmedia/theme-authoring-compiler` adapter.
The host's **existing** CMS remains the authority; no default database or
global principal exists. Repository methods:
- `getSource({principal,artifactId})` returns exact immutable source, revision, hash, filename, fragment.
- `saveDraftStyles({principal,pageId,sectionId,artifactId,scope,edits,css,expectedRevision,expectedHash,expectedCmsRevision})`: atomically check expected revisions, write existing CMS draft, emit canonical revision receipt.
- `saveSourceDraft({principal,artifactId,source,patches,expectedRevision,expectedHash})`: atomically store immutable R2 artifact, version canonical D1 revision. Never publish.
- Authorization is required on every invocation; `principal` must come from trusted execution context, not input.

Operations: inspect, previewStyles, saveDraftStyles, proposeSourcePatch, saveSourceDraft.
**Not yet a complete installation** until the CMS host implements these adapter methods and the preview/publish/render/reset path passes an end-to-end test.
