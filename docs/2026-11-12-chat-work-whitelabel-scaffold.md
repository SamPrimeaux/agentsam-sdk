# AgentSam Local Studio — Chat/Work navigation repair
Date: 2026-11-12
Status: existing feature branch only; no remote push or production deployment.

## Correct product ownership
- InnerAnimalMedia owns the main authenticated platform shell and installed-app catalog.
- AgentSam Local Studio is the existing Chat/Work conversational interface at /admin/agentsam, not a newly invented Developer environment.
- The AgentSam SDK is the independently distributed npm/PyPI development toolkit.
- CAD Creator, MovieMode, SamSketch, Growth, Completeful and other bundled or installed capabilities are projected from their actual manifest/host records.

## Single-source implementation
- packages/agentsam-nav owns presentation primitives, not routing or account data.
- apps/local-studio/scripts/studio-navigation.mjs emits navigation from app manifests and existing route ownership.
- apps/local-studio/frontend/public/admin/host-config.js owns the packaged Console sidebar projection.
- apps/local-studio/frontend/agentsam/AgentSamShell.tsx owns the conversation/work callbacks and the embedded application's navigation state.
- The installed app identity supplies the contextual sidebar icon and name; the previous AgentSam / Developer selector has been removed.

## Implemented
- One visible search icon with a project/chat filter disclosed on demand. The packaged Console's redundant top search control is hidden; Cmd+K remains.
- New chat above the platform destinations when the live conversation handler is available.
- Exactly one Projects history collection between Pinned and Recents, with a separate action opening existing /admin/projects.
- Library is the menu label for existing /media routes. No media data migration.
- Products is the single /admin/products destination; duplicate Store Products child removed; Product Studio renamed Create at /admin/products/create.
- Completeful's existing bundled provider-app manifest now declares its route and navigation metadata. It opens the actual Create/Completeful surface; no second catalog was created. Its read/search/sync capabilities are further along than order creation or publishing, which remain degraded or approval gated.
- Conversation actions split real Installed apps from contextual Workspace panels, preserving both.
- File viewer has an Open AgentSam entrypoint to the existing assistant. The viewer does not claim to attach file bytes or provide complete DOCX rendering.
- OpenAI Chat Completions translation drops unvalidated temperature/top_p overrides (including legacy temperature 0.6) rather than forwarding incompatible sampling parameters.

## Verification
- Navigation package: 26 tests pass.
- Navigation projection: 4 tests pass.
- Chat upstream translation: 4 tests pass.
- Local Studio packaged desktop build: passes, existing code-splitting warnings remain.
- 390x844 mobile smoke: passes, including one drawer, New chat, Projects, Home, Ideas, Goals, and Library/Media.
- A broader packaged-console-mount source-assertion suite has stale expectations for prior markup; it has 5 failures and was not used as proof of this change.
- Broad frontend TypeScript check still reports unrelated implicit-any diagnostics in localMediaSource.test.mjs.

## Deferred work
- Live authenticated backend verification of the Completeful order/publish pipeline and any app-specific provider enablement.
- Fully paginated in-app DOCX/document rendering and automatic file-context attachment in miniAgentSam.
- Full runtime model error verification beyond the request-construction regression test.
- Production deployment, release, and visual signoff on the hosted desktop interface.
