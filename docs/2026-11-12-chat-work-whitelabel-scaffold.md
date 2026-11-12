# AgentSam desktop Chat / Work white-label scaffold
Date: 2026-11-12
Visual reference: user-supplied ChatGPT desktop screenshots.

## Model: two navigation levels
1. Product environment: AgentSam (conversation/multi-step work) or Developer (existing Local Studio /cli route). The host routes this selection; it does not change the LLM or grant permissions.
2. Task mode within AgentSam: Chat / Work. The existing Nav.ModeSwitcher controls this independently of product environment.

This reproduces useful information architecture, not OpenAI branding or a new standalone app.

## Source ownership
- packages/agentsam-nav: environment switcher, Chat/Work control, sidebar, collections, search disclosure, responsive states and semantic theme tokens. No account data is owned here.
- apps/local-studio/frontend/agentsam/AgentSamShell.tsx: authenticated routing, project/chat actions and selected environment.
- apps/local-studio/frontend/public/admin/host-config.js: actual packaged Console navigation projection and mobile drawer; this adapter is reused rather than duplicated.
- apps/local-studio/frontend/agentsam/AgentSamPage.tsx: conversation surface and visible Chat/Work mode control.
- apps/local-studio/frontend/src/components/workbench/composer.tsx: existing model/run-mode selection, attachments, project picker and plugin entry points.
- apps/local-studio/frontend/agentsam/AgentSamLaunchDock.tsx: existing five mobile destinations Chats, Home, Ideas, Goals, Library. Root / remains public; /admin/home remains signed-in Home.

## Implemented
- AgentSam / Developer product environment menu in the real desktop and packaged host navigation; Developer links to existing /cli, AgentSam to /admin/agentsam.
- Separate Chat / Work selection visible within active conversations.
- Pinned, Projects, Recents grouped from real account projects and conversations; projects disclose associated threads; unfiled chats appear in Recents.
- One search icon in the sidebar header with on-demand local chat/project filter.
- Mobile drawer with logo-to-close behavior and the product environment selector.
- Existing host callbacks control actions. No hardcoded plugins, pretend projects or synthetic installed apps.

## Acceptance results
- npm test --workspace=@inneranimalmedia/agentsam-nav: 26 tests passed.
- cd apps/local-studio && npm run build:desktop: passed.
- cd apps/local-studio && npm run smoke:mobile-launch-dock: passed at 390x844, including environment menu, search disclosure, one drawer, Home, Ideas, Goals, Library/Media.
- The broad frontend TypeScript check has unrelated implicit-any diagnostics in frontend/src/components/media/localMediaSource.test.mjs; no new diagnostics observed in modified source.

## Known gaps before production parity
- Developer currently navigates to the actual CLI. It is not yet a complete Codex-equivalent repository/diff/test interface.
- The Chat / Work selector preserves existing UI state. Distinct task execution policies, persistence and end-to-end Work orchestration are not yet verified.
- Screenshot entries such as Scheduled, Explore and composer tool actions should only be displayed when real installed apps/capability records back them.
- ChatGPT plugins or MCP Apps can extend the host but cannot replace its native outer shell. Do not create a duplicate AgentSam plugin merely to emulate navigation.
- No remote push or production deployment is included in this scaffold.
