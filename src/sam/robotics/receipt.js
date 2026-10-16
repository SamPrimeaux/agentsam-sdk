import { hashScene } from './world.js';
export function buildExecutionReceipt(r) {
  return {
    schema: 'sam.robotics.receipt.v1', operation_id: r.operation_id, execution_id: r.execution_id,
    source: r.source ?? null, scene_hash: r.scene_hash, robot: 'franka-panda', physics_engine: r.physics_engine ?? 'mujoco-adapter',
    planner: 'sam-goap-astar-v1/sam-franka-trajectory-v1', target_object: r.target_object,
    source_pose: r.source_pose, destination_pose: r.destination_pose, plan: r.plan,
    trajectory_validation: r.trajectory_validation, collision: r.collision ?? { incidents: 0 },
    final_pose: r.final_pose ?? null, pose_error_m: r.pose_error_m ?? null,
    stages: { plan_produced: !!r.plan, simulation_started: !!r.simulation_started, motion_completed: !!r.motion_completed, visual_placement: !!r.visual_placement, physical_grasp_verified: r.grasp_verified === true, goal_verified: !!r.goal_verified },
    success: !!r.goal_verified, model_calls: 0, model_spend_usd: 0, duration_ms: r.duration_ms ?? 0,
  };
}
export function cacheKey({ world, objectId, to, plannerVersion = 'v1' }) {
  return hashScene({ h: world.scene_hash, objectId, to, robot: 'franka-panda', plannerVersion, collision_config: 'default' });
}
export class MotionCache {
  constructor() { this.map = new Map(); this.hits = 0; this.misses = 0; }
  get(k) { const v = this.map.get(k); v ? this.hits++ : this.misses++; return v ?? null; }
  set(k, v) { this.map.set(k, v); }
}
