# SAM Robotics + Franka Chess — Handoff

Branch target: `feat/chess-franka-simulation-20261016` (worktree `agentsam-sdk-chess-franka-20261016`). Code currently in main checkout; apply the listed files there, do not create a second registry/schema.

## Landed
- SAM (existing registry, `model:"never"`): `src/sam/robotics/{world,franka,chess-adapter,receipt,index}.js`, `src/sam/operations/robotics.js` (10 ops), registered via `src/sam/packs/core.js` CORE_OPERATIONS. Tests `test/robotics/robotics.test.mjs` (8 pass: transforms/units, joint limits, capture/castle/en-passant/promotion, 100-move verify, Mode B measured-pose gate, CAD revision binding).
- CAD app (`apps/cad-creator/frontend`): `lib/robotics/runtime/ManipulationSequence.ts` (generic primitives + `verifyMeasuredPose` over MuJoCo `xpos`; donor `SequenceAnimator.ts` preserved unchanged), `lib/robotics/chess/frankaChessScene.ts` (cohesive scene descriptor: preserved Baroque GLB render URLs, derived cylinder collision proxies, Franka beside rank 8, player/cinematic cameras, Standard vs Franka opponent modes). Typechecks clean.
- CLI: `src/cli/command-catalog.js` surfaces `cad.project.v1` + `robotics`.
- Verified: `node --test test/robotics/robotics.test.mjs` 8/8; `cad-project`+workflow 9/9; `node scripts/cad-registry.mjs --check` parity. Demo `e2→e4`, `e7→e5`: receipts success, `model_calls:0`, `physical_grasp_verified:false` (Mode A visual attachment, honestly labeled).

## Contracts preserved
`cad.project.v1` nine tools untouched/inactive; canonical inches `scale=1`; conversions only at boundaries (in→OCCT mm→Blender m) via `design_model_build`; FileProjectStore/D1 families unchanged; no new D1 tables; GOAP = task planning only, never IK/motion.

## Not yet proven (do not claim)
Browser playthrough of the cohesive scene, live MuJoCo Mode B contact grasp (gate exists; needs measured `mjData.xpos` evidence in-browser), Stockfish/WASM (deployed selector is chess.js + random; Obsidian alpha-beta not deployed), hosted IAM activation, Rust/Go additions (no measurable benefit shown — not added gratuitously; OCCT C++ already consumed through existing build contract).
