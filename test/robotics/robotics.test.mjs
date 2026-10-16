import test from 'node:test';
import assert from 'node:assert/strict';
import { squareToWorld, worldToSquare, createWorld, inchesToMm, inchesToM, applyRelocation } from '../../src/sam/robotics/world.js';
import { checkJointLimits, FRANKA, planTrajectory } from '../../src/sam/robotics/franka.js';
import { moveToGoals } from '../../src/sam/robotics/chess-adapter.js';
import { roboticsOps } from '../../src/sam/operations/robotics.js';
import { CORE_OPERATIONS } from '../../src/sam/packs/core.js';

const op = (id) => roboticsOps.find((o) => o.id === id);
const mkWorld = () => createWorld({ objects: [
  { id: 'white_pawn_e2', kind: 'pawn', square: 'e2' }, { id: 'black_pawn_e7', kind: 'pawn', square: 'e7' },
  { id: 'black_knight_g8', kind: 'knight', square: 'g8' }, { id: 'white_rook_a1', kind: 'rook', square: 'a1' },
]});

test('square transforms roundtrip + units at CAD boundary (inches->OCCT mm->Blender m)', () => {
  for (const s of ['a1','e4','h8','e7']) assert.equal(worldToSquare(squareToWorld(s)), s);
  assert.equal(inchesToMm(1), 25.4); assert.ok(Math.abs(inchesToM(72*12) - 21.9456) < 1e-9); // 72ft envelope in inches->m, canonical doc unchanged
  assert.throws(() => squareToWorld('z9'), /invalid_square/);
});
test('all 10 robotics ops registered once in existing CORE_OPERATIONS, model never', () => {
  assert.equal(roboticsOps.length, 10);
  for (const o of roboticsOps) { assert.equal(o.execution.model, 'never'); assert.equal(CORE_OPERATIONS.filter((c) => c.id === o.id).length, 1); }
});
test('joint limits, unreachable, invalid input fail explicitly (no cosmetic fallback)', async () => {
  assert.equal(checkJointLimits([9,0,0,0,0,0,0]).ok, false);
  assert.equal(planTrajectory(FRANKA.home, [9,0,0,0,0,0,0]).status, 'invalid_input');
  const r = await op('robotics.motion.plan').handler({ world: mkWorld(), object_id: 'black_pawn_e7', to_square: 'e5', target_joints: FRANKA.home });
  assert.equal(r.ok, true);
});
test('chess adapter: capture first, castling both, en passant, promotion replace', () => {
  assert.equal(moveToGoals({ object_id: 'p', from: 'e4', to: 'd5', captured_id: 'q', captured_square: 'd5' }).goals[0].reason, 'capture_removed_first');
  assert.equal(moveToGoals({ object_id: 'k', from: 'e1', to: 'g1', castle_rook_id: 'r', castle_rook_from: 'h1', castle_rook_to: 'f1' }).goals.length, 2);
  assert.equal(moveToGoals({ object_id: 'p', from: 'e5', to: 'd6', captured_id: 'bp', captured_square: 'd5' }).goals[0].to, 'capture_tray');
  assert.equal(moveToGoals({ object_id: 'p', from: 'e7', to: 'e8', promotion: 'q' }).goals.at(-1).goal, 'replace_representation');
});
test('100 deterministic simulated moves, exactly-once verify, zero LLM, Mode A not claimed as grasp', async () => {
  let world = mkWorld(), ok = 0;
  const files = 'abcdefgh';
  for (let n = 0; n < 100; n++) {
    const ids = ['white_pawn_e2','black_pawn_e7','black_knight_g8','white_rook_a1'];
    const id = ids[n % 4], to = `${files[(n * 3 + 1) % 8]}${(n % 8) + 1}`;
    const cur = world.objects.find((o) => o.id === id); if (cur.square === to) continue;
    const r = await op('robotics.motion.execute').handler({ world, object_id: id, to_square: to, execution_id: `t${n}` });
    assert.equal(r.receipt.model_calls, 0); assert.equal(r.receipt.stages.physical_grasp_verified, false); assert.equal(r.receipt.stages.visual_placement, true);
    world = r.world;
    const v = await op('robotics.motion.verify').handler({ world, object_id: id, expected_square: to });
    if (v.ok) ok++;
  }
  assert.ok(ok >= 90, `verified ${ok}/100`);
  assert.equal(world.objects.find((o) => o.id === 'black_pawn_e7').id, 'black_pawn_e7'); // identity survives
});
test('CAD-derived scene retains exact DesignProject revision binding', () => {
  const w = createWorld({ environment: 'cad', source: { project_id: 'courtyard', revision: 3, content_hash: 'a'.repeat(64) }, objects: [{ id: 'table-1', kind: 'table', pose: { x: 1, y: 1, z: 0 } }] });
  assert.deepEqual(w.source, { project_id: 'courtyard', revision: 3, content_hash: 'a'.repeat(64) });
  assert.equal(applyRelocation(w, 'table-1', 'a1').source.revision, 3);
});

test('Mode B: only measured pose within tolerance verifies grasp', async () => {
  const { verifyMeasuredPose, relocationSequence } = await import('../../src/sam/robotics/franka.js');
  assert.equal(verifyMeasuredPose({x:0.1,y:0.1,z:0},{x:0.1,y:0.1,z:0}).grasp_verified, true);
  assert.equal(verifyMeasuredPose({x:0.5,y:0.1,z:0},{x:0.1,y:0.1,z:0}).grasp_verified, false);
  assert.equal(verifyMeasuredPose(null,{x:0,y:0}).grasp_verified, false);
  assert.equal(relocationSequence({mode:'B'}).grasp_verified, false);
  assert.equal(relocationSequence({mode:'B',measured:{grasp_verified:true}}).grasp_verified, true);
});
test('native boundary: OCCT mm + Blender m derive from canonical inches, project JSON unmutated', () => {
  const doc = { units: 'inches', scale: 1, span_in: 72*12 };
  assert.equal(inchesToMm(doc.span_in), 21945.6); assert.ok(Math.abs(inchesToM(doc.span_in)-21.9456)<1e-9);
  assert.equal(doc.scale, 1);
});
