/**
 * Generic manipulation primitives — generalization of SequenceAnimator.
 * SequenceAnimator (cube stacking donor) is preserved unchanged; this class
 * is object-agnostic: no cubes, no chess rules. Mode A = synchronized visual
 * attachment (grasp_verified:false). Mode B requires measured body pose
 * evidence via verifyMeasuredPose() before any grasp claim.
 */
export type Primitive = 'move_to_pose'|'approach_object'|'open_gripper'|'align_gripper'|'close_gripper'|'lift_object'|'transport_object'|'lower_object'|'release_object'|'retreat'|'return_home';
export const RELOCATION_PRIMITIVES: Primitive[] = ['move_to_pose','approach_object','open_gripper','align_gripper','close_gripper','lift_object','transport_object','lower_object','release_object','retreat','return_home'];

export function verifyMeasuredPose(xpos: ArrayLike<number>, bodyId: number, target: {x:number;y:number;z:number}, toleranceM = 0.01) {
  const dx = xpos[bodyId*3]-target.x, dy = xpos[bodyId*3+1]-target.y, dz = xpos[bodyId*3+2]-target.z;
  const errorM = Math.hypot(dx, dy, dz);
  return { grasp_verified: errorM <= toleranceM, error_m: errorM, tolerance_m: toleranceM };
}

export class ManipulationSequence {
  steps: Primitive[] = [...RELOCATION_PRIMITIVES];
  index = 0; cancelled = false;
  constructor(private mode: 'A'|'B' = 'A') {}
  get current(): Primitive|null { return this.steps[this.index] ?? null; }
  get graspClaim() { return this.mode === 'B' ? 'physics_requires_measured_evidence' : 'visual_attachment'; }
  advance() { if (!this.cancelled && this.index < this.steps.length) this.index++; return this.current; }
  cancel() { this.cancelled = true; }
  reset() { this.index = 0; this.cancelled = false; }
  get done() { return this.index >= this.steps.length; }
}
