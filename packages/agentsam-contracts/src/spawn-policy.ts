/**
 * Canonical portable policy contract (v2). Enforcement stays in the authorized
 * AgentSam host, never in an agent profile, prompt, UI or caller-supplied scope.
 */
export const SPAWN_POLICY_CONTRACT = 'agentsam.spawn-policy.v2' as const;
export type SpawnPolicyLimitsV2 = {
  maxCostPerSessionUsd: number | null;
  maxCostPerCallUsd: number | null;
  allowSubagentSpawn: boolean;
  allowFanoutExecution: boolean;
  maxSpawnDepth: number;
};
export type SpawnBudgetInputV2 = {
  policy: SpawnPolicyLimitsV2 | null;
  requestedJobCapUsd?: number | null;
  requestedLaneCapUsd?: number | null;
  requestedDepth?: number;
};
/**
 * Pure, deterministic budget decision after host identity and workspace policy
 * have been resolved by the server. Never grants permissions absent in policy.
 */
export function evaluateSpawnBudgetV2(input: SpawnBudgetInputV2):
  | {ok:true;contract:typeof SPAWN_POLICY_CONTRACT;jobCapUsd:number;laneCapUsd:number}
  | {ok:false;contract:typeof SPAWN_POLICY_CONTRACT;reason:string} {
  const invalid=(reason:string)=>({ok:false as const,contract:SPAWN_POLICY_CONTRACT,reason});
  const policy=input.policy;
  if(!policy)return invalid('spawn_policy_unresolved');
  if(!policy.allowSubagentSpawn)return invalid('subagent_spawn_disabled');
  if(!policy.allowFanoutExecution)return invalid('fanout_execution_disabled');
  if((input.requestedDepth??1)>policy.maxSpawnDepth)return invalid('spawn_depth_exceeded');
  const cap=(value:unknown):number|null=>
    typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
  const allowedJob=cap(policy.maxCostPerSessionUsd);
  const allowedLane=cap(policy.maxCostPerCallUsd);
  if(allowedJob===null)return invalid('policy_job_cost_cap_required');
  if(allowedLane===null)return invalid('policy_lane_cost_cap_required');
  const wantedJob=cap(input.requestedJobCapUsd)??allowedJob;
  const wantedLane=cap(input.requestedLaneCapUsd)??allowedLane;
  return {ok:true,contract:SPAWN_POLICY_CONTRACT,
    jobCapUsd:Math.min(wantedJob,allowedJob),
    laneCapUsd:Math.min(wantedLane,allowedLane,wantedJob,allowedJob)};
}
