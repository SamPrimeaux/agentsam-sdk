// Franka Panda 7-joint controller primitives. Deterministic, no model calls.
// Mode A: synchronized visual attachment (explicitly NOT a physics grasp).
// Mode B: physics-validated — requires measured evidence passed in; never faked here.
export const FRANKA = {
  name: 'franka-panda', joints: 7,
  limits: [[-2.8973, 2.8973], [-1.7628, 1.7628], [-2.8973, 2.8973], [-3.0718, -0.0698], [-2.8973, 2.8973], [-0.0175, 3.7525], [-2.8973, 2.8973]],
  home: [0, -0.785, 0, -2.356, 0, 1.571, 0.785], maxReachM: 0.855,
};
export const PRIMITIVES = ['move_to_pose', 'approach_object', 'open_gripper', 'align_gripper', 'close_gripper', 'lift_object', 'transport_object', 'lower_object', 'release_object', 'retreat', 'return_home'];

export function checkJointLimits(q) {
  if (!Array.isArray(q) || q.length !== 7) return { ok: false, error: 'joint_vector_must_be_7' };
  const bad = q.findIndex((v, i) => !Number.isFinite(v) || v < FRANKA.limits[i][0] || v > FRANKA.limits[i][1]);
  return bad >= 0 ? { ok: false, error: `joint_limit_exceeded:${bad}`, joint: bad } : { ok: true };
}
export function reachable(pose, base = { x: 0.3, y: -0.25, z: 0 }) {
  const d = Math.hypot(pose.x - base.x, pose.y - base.y, pose.z - base.z);
  return { ok: d <= FRANKA.maxReachM, distance_m: Number(d.toFixed(6)), max_reach_m: FRANKA.maxReachM };
}
/** Linear joint-space trajectory with sampled limit validation. Collision hook is explicit. */
export function planTrajectory(from, to, { steps = 24, collides = null } = {}) {
  const a = checkJointLimits(from), b = checkJointLimits(to);
  if (!a.ok) return { ok: false, status: 'invalid_input', error: a.error };
  if (!b.ok) return { ok: false, status: 'invalid_input', error: b.error };
  const waypoints = [];
  for (let s = 0; s <= steps; s++) waypoints.push(from.map((v, i) => v + (to[i] - v) * (s / steps)));
  if (typeof collides === 'function') {
    const hit = waypoints.findIndex((w) => collides(w));
    if (hit >= 0) return { ok: false, status: 'collision', collision_step: hit, waypoints };
  }
  return { ok: true, status: 'planned', waypoints, steps, engine: 'sam-franka-trajectory-v1' };
}
/** Mode B evidence: measured MuJoCo body pose (mjData.xpos slice) vs target. */
export function verifyMeasuredPose(measuredPose, target, toleranceM = 0.01) {
  if (!measuredPose || !target) return { grasp_verified: false, error_m: null, reason: 'missing_measured_evidence' };
  const errorM = Math.hypot(measuredPose.x - target.x, measuredPose.y - target.y, (measuredPose.z ?? 0) - (target.z ?? 0));
  return { grasp_verified: errorM <= toleranceM, error_m: Number(errorM.toFixed(6)), tolerance_m: toleranceM };
}
/** Sequence for one relocation. grasp_verified is true ONLY in mode B with measured evidence. */
export function relocationSequence({ mode = 'A', measured = null } = {}) {
  const steps = ['move_to_pose', 'approach_object', 'open_gripper', 'align_gripper', 'close_gripper', 'lift_object', 'transport_object', 'lower_object', 'release_object', 'retreat', 'return_home'];
  const physicsValidated = mode === 'B' && measured?.grasp_verified === true;
  return { steps, mode, grasp_claim: mode === 'B' ? (physicsValidated ? 'physics_validated' : 'unverified') : 'visual_attachment', grasp_verified: physicsValidated };
}
