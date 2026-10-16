# CAD Creator / robotics shipping ledger — 2026-10-16

This is a release gate, not a claim that features merged to SDK automatically work in an installed desktop, online CAD host, or public chess game.

## Source already on main
- SDK PR #243/249/252: existing CAD Creator source and desktop embedding; approval-gated revision tools, native OCCT work.
- SDK PR #254: preserved FreeCAD BIM starter source and 3D preview library in standalone Node CAD Creator.
- SDK PR #257: opt-in, host-resolved CAD operator pack with twelve executable schema-bound operations, not yet mounted in hosted/desktop miniAgentSam.
- IAM PRs #482/#483: visual Franka chess mode and Obsidian-style camera presets in MeauxChess; Durable Object chess backend remains authoritative.
- Host has Cloudflare OAuth / GitHub OAuth infrastructure; no user token textbox should take its place.

## Source fixes in this branch
- Only Plan, Model, Robotics are primary CAD destinations. Legacy `parametric` and `render` IDs are accepted for older links, but actions route to Model's contextual inspector and existing Render modal.
- Active CAD selection is now posted to AgentSam only when a server-confirmed saved project revision is available. No `revision: 1` fabricated for drafts.
- A MuJoCo-only reach test invokes the installed IK simulator, measures movement from telemetry, and cannot claim verified grasp/real hardware behavior.
- Publishing choices read the authenticated host's OAuth connection status. No PAT, CF API token or arbitrary Docker endpoint fields appear in the CAD UI. Remote publishing adapters **refuse success until a real, host-owned upload route returns durable artifact receipts**. Local export remains usable.
- CAD Creator app icon/favicon uses the supplied InnerAnimalMedia CAD icon.

## Still blocked; don't mark shipped

| Priority | Acceptance scenario | Missing integration |
| --- | --- | --- |
| P0 | Open ArchDetail/BIMExample from installed desktop CAD Creator, edit, save native working copy, restore, reload | SDK issue #255: embedded guest ↔ authorized local host BIM source bridge |
| P0 | Cloudflare-authorized CAD project opened on desktop then on another authorized session | project-scoped D1 `projects` authority, `project_storage` account/bucket resolver, private R2 originals and revisioned derivatives |
| P0 | Ask miniAgentSam to add a door or create a solid; approve the typed CAD operation and verify the job receipt and artifact in the same project | host install of PR #257 `createCadModelTools` onto existing model capability adapter and progress/receipt/viewport bridge; SDK issue #256 |
| P0 | Publish authenticated project to GitHub App or Cloudflare OAuth resource, verify remote content hash, report actual URL | host-owned connected repository/R2 APIs, tenant-scoped write permission, artifact receipt validation; current CAD frontend rightly refuses remote fake-success |
| P1 | Click a chess piece or object → plan arm trajectory → simulate → measured grasp/placement receipt | MuJoCo world selection + deterministic SAM robotics operations + simulation and chess board transform synchronization, **not just** PR #482 visuals |
| P1 | Real architect workflow from Plan ↔ 3D walkthrough ↔ assemblies | viewport camera and 3D data authority, walkthrough acceptance, selected-object inspector and saved revision semantics |
| P1 | Cinematic chess game becomes branded single MeauxChess experience | UI/board look parity (not merely camera), existing premium GLB pieces, DO multiplayer and Stockfish; on-device and touch verification |
| P1 | Show real case-study video/interactive capture of chess-robot workflow | capture the actual running Three.js scene; storyboard, controlled lighting, truthful telemetry labels and user-interactable playable demo; never substitute invented glossy images |
| P2 | Alternate robot hand / QB Robotics SoftHand | verify vendor/model asset license and fit; abstract end-effector profile, retarget joint rig, gripper limits, and physics validation. **No physical grasp claim** |
| P2 | AgentSam favicon / pet sprites | inventory canonical existing favicon/animation/GIF package and phases, preserve originals, define deterministic idle/thinking/tool/executing/approval/error states, integrate only once in canonical AgentSam surface |

## Canonical experience requirements
1. **One shell**: Local Studio hosts app navigation and AgentSam composer. CAD Creator owns canvas and contextual inspectors, not competing settings/navigation.
2. **One project authority**: `projects`, `project_storage`, artifacts/media and CAD jobs own identity, storage and evidence. No new local-only shadow CAD database or per-tenant hardcodes.
3. **One operation path**: selected object + saved revision → AgentSam capability registry → authorized approval hook → native/remote execution → typed receipt → same project's visible result.
4. **One publishing authority**: discover a user's real GitHub App/Cloudflare OAuth grant; never request keys in viewport or return successful receipt for a speculative URL.
5. **Simulation honesty**: visual move, engine-legal chess move, simulator trajectory, contact sensor evidence and physical grasp are distinct statuses.

## Release checklist

For each actual ship: clean branch and CI, reproducible production build; installed desktop test in embedded mode; native asset discovery; save/reload and revision conflict rejection; Cloudflare OAuth account/tenant separation; GitHub/R2 provenance hash receipts; iPhone-sized canvas/inspector/chat; real chess multiplayer and robot scenario; checksummed original CAD/GLB assets; final deployment hash and URL verification.
