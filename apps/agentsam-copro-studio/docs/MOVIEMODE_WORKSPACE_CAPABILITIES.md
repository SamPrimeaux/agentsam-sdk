# MovieMode × CoPro — docked workspace & agent capability contract

**Current implementation authority:** `packages/copro-ui/src/studio.tsx`, `workspace-layout.tsx`, `timeline.tsx`, `capabilities.ts`; host `apps/agentsam-copro-studio/src/main.tsx`. This is one reusable visual editor. MovieMode owns the professional GUI. CoPro/EditPilot assists within it, never replacing the player, inspector, browser or timeline.

## Desktop baseline (all user controlled)

| Region | Default, 1440px view | Resize/dock behavior |
| --- | --- | --- |
| Media/Tool browser | 490px, upper left | horizontal splitter; collapse; swap side; float/drag; native corner resize; redock |
| Player/Monitor | remaining center (about 584px) | flexes with both sidebars; float/drag/resize/redock as one player+transport unit |
| Selection inspector | 350px, upper right | horizontal splitter; persistent project details; selection tabs; float/drag/resize/redock |
| Multitrack timeline | 45% of available workspace, across full bottom | vertical splitter; zoom; persisted track-height presets (48/70/96/128px) |

Layout choices: Balanced, Media Focus, Timeline Focus, Custom. A versioned `localStorage` setting persists placements and sizes. For 900–1179px hosts, the creation browser and selection inspector share a switchable secondary region; the player and timeline stay available. Under 760px the editing dock is accessible at the bottom. Work/embedded dimensions are evaluated against the **workspace ResizeObserver**, not browser-only breakpoints.

**Progressive disclosure**: category tabs are inside the Media/Tool browser; subcollections are inside the category; asset content fills the remaining browser. The selection inspector never changes the browser. The player never becomes an editing modal. Timeline tools and track controls remain in the timeline. Accessible resize separators support pointer/arrow/Home/End; undocked panes expose explicit Dock commands. The current floating panes are not a fully arbitrary multi-window docking tree; adding that would require a documented workspace tree, not a duplicate editor.

## Capabilities for miniAgentSam

`packages/copro-ui/src/capabilities.ts` is the canonical MovieMode `CapabilityId` registry. IDs use `surface.object.interaction` (examples: `workspace.layout.dock`, `timeline.clip.trim`, `inspector.video.transform`, `generation.video.create`, `export.video.render`, `agent.proposal.apply`). The type union derives from registry keys; `SURFACE_CAPABILITIES` and `EDITOR_ACTION_CAPABILITIES` provide discovery and mapping for current GUI operations.

Each entry declares actor (`user`/`agent`/`system`), resource scope (`workspace`/`project`/`asset`/`track`/`clip`/`selection`), effect (`read`/`write`/`external`), handler identifier, gates (`supported`/`verified`), approval level (`none`/`user`/`destructive`/`external`), dependencies, and optional existing CoPro provider adapter capability.

**Enforcement**:
1. A visible GUI control does not automatically grant tool access to an agent. The user can act in the GUI; agent-originated mutations need explicit grants/approvals.
2. A named handler without a registered implementation is unavailable. Verified operations additionally need a verification receipt; video generation/transcription/rendering need a matching registered provider capability (`video.generate`, `media.transcribe`, `render.video`) from `@inneranimalmedia/copro-provider-contracts`.
3. Use `resolveCapabilities(runtime, actor)` for affordance/discovery and `canDo(runtime, id, actor)` as a **preflight only**. Native/server execution endpoints MUST re-evaluate actor, project/asset scope, grant, approval and dependencies before performing any operation. Do not trust a client-reported `enabled` flag.
4. miniAgentSam must propose actions with explicit clip IDs and arguments. Applying a proposal must be undoable where an editor command exists and must not silently approve destructive or external operations.
5. Keep the existing CoPro command engine, project document, browser media store, provider adapters and OAuth identities; no new database family and no mocked AI models.

## Source-media and preview rules

Imported originals persist in the existing browser IndexedDB media authority; derived video thumbnails are generated from decoded frames and cached separately. The clip timeline uses real thumbnails where decodable and the imported audio source uses decoded waveforms where supported. Some codecs cannot be displayed in browsers; the preview gives a visible error rather than pretending the file is playable. Use browser-compatible H.264/AAC MP4 or a supported WebM for browser QA. Desktop and hosted export adapters still need real rendition receipts before `export.video.render` can be verified.

## Manual acceptance

- Launch `http://127.0.0.1:5303/` using the existing MovieMode PM2 preview, then Create project (must open editor directly with four regions).
- At 1440/1600/1920 viewports inspect empty project, import H.264 MP4, select video, drag the two upper vertical dividers and bottom timeline divider, change track height, undock/redock three upper regions, change inspector scale, reopen project and verify clip and stored browser media.
- At 1024/768/390 widths verify player, active pane, timeline and bottom dock are reachable without horizontal page overflow; validate right inspector can be opened using an existing clip or Export.
- Production verification additionally requires source-audio treatment, rendered MP4 bytes, authenticated provider execution, user-facing onboarding and server-side authorization receipts.

**Evidence (Mac-local, not committed):** `~/Downloads/MovieMode-QA-20261017/` contains browser screenshots of empty, imported, selected and reopened editor states. All work stays on the feature branch until current `main` is reconciled and merge approval is given.
