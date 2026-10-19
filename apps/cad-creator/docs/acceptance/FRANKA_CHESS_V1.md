# CAD Creator — Chess vs Franka (functional preview)

## Goal
Open CAD Creator → Robotics and play White against the Franka Panda arm
acting as Black. This extends the existing MuJoCo scene; there is no
separate chess application or duplicate CAD editor.

## Implementation
- `chess.js` determines move legality, captures, promotion, checkmate, and draws.
- A deterministic, two-ply, zero-LLM opponent chooses the robot's moves.
- Standard captured-piece points: pawn 1, knight/bishop 3, rook 5, queen 9.
- Interactive chess meshes share the existing MuJoCo Three.js scene and camera.
- The source-to-target IK animation uses the existing SimulationProvider.
- Return to the preserved cube-stacking sandbox with the Sandbox control.
- StrictMode canvas cleanup and pointer pass-through fix two existing scene defects.

## Honesty & remaining gates
- This is **Mode A visual positioning / IK**. Rendered chess pieces are not yet
  collision bodies. The robot moving over them does NOT verify a real grasp.
- The SDK's 10 executable SAM robotics operations and 100-move deterministic
  test remain preserved; the frontend does not yet dispatch through the hosted
  AgentSam registry or produce measured Mode B grasp receipts.
- The current pieces use procedural shapes. Existing ornate GLB source URLs in
  `frankaChessScene.ts` and all original chess assets remain unchanged, ready
  for a later presentation pass.
- Automatic queen promotion is supported; a promotion chooser is future polish.
- The MuJoCo engine currently relies on network-fetched WASM and Menagerie assets.
  Do not describe this mode as offline-capable until it is bundled locally.
- The CAD editor's backend persistence and websocket routes remain governed by
  SDK issue #253, not by this frontend chess mode.

## Repeatable verification
```sh
cd apps/cad-creator
npm run typecheck --workspace @inneranimalmedia/agentsam-cad-frontend
npm run test --workspace @inneranimalmedia/agentsam-cad-frontend -- --run src/lib/robotics/chess/robot-match.test.ts
npm run build --workspace @inneranimalmedia/agentsam-cad-frontend
```
Browser test: click the White pawn on e2 then e4, wait for Franka's
response; confirm two half-moves and no page errors. Switch Chess → Sandbox →
Chess; exactly one canvas should remain each time.

See temporary Mac QA artifacts in `~/Downloads/agentsam-robot-chess-*20261016.png`.
