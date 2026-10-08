/**
 * SDK-owned Analytics Engine operation schema v1. No raw user prompts, tokens,
 * customer names, URLs, secrets or sensitive identifiers are written.
 * Existing agentsam-analytics read models remain the consumer contract.
 */
export type OperationEvent = {
  workspaceId: string; domain: string; operation: string;
  outcome: 'success' | 'failed' | 'cancelled' | 'blocked';
  durationMs?: number; queueWaitMs?: number; externalWaitMs?: number;
  activeModelMs?: number; retries?: number; costUsd?: number;
  errorCode?: string; provider?: string; model?: string; buildSha?: string;
};
export type AnalyticsEngineBinding = {
  writeDataPoint(point: { index: string; blobs: string[]; doubles: number[] }): void;
};
const clean=(s:unknown,max=120)=>String(s??'').replace(/[^a-zA-Z0-9_.:\-/]/g,'').slice(0,max);
const number=(n:unknown)=>Number.isFinite(Number(n))&&Number(n)>=0?Number(n):0;
export function serializeOperationEvent(event: OperationEvent) {
  const index=clean(event.workspaceId,96);
  if(!index||!clean(event.domain)||!clean(event.operation))throw new TypeError('operation identity required');
  return {
    index,
    blobs: [
      'agentsam.operation.v1', clean(event.domain),clean(event.operation),
      clean(event.outcome),clean(event.provider),clean(event.model),clean(event.errorCode),
      clean(event.buildSha,64),
    ],
    doubles: [number(event.durationMs),number(event.queueWaitMs),number(event.externalWaitMs),
      number(event.activeModelMs),number(event.retries),number(event.costUsd)],
  };
}
export function recordOperation(binding:AnalyticsEngineBinding|null|undefined,event:OperationEvent) {
  if(!binding?.writeDataPoint)return {recorded:false,reason:'analytics_engine_not_bound'} as const;
  const record=serializeOperationEvent(event);
  binding.writeDataPoint(record);
  return {recorded:true,reason:null} as const;
}
/** Host-capability projection. These are NOT proof that a Basin warehouse is available. */
export type BasinCapability = {
  enabled: boolean;
  status: 'connected'|'unavailable'|'permission_required'|'error';
  warehouses: Array<{id:string;label:string}>;
  pipelines: Array<{id:string;label:string;status:string;lastEventAt:string|null}>;
  catalogTables: Array<{name:string;namespace:string;rows:number|null}>;
  checkedAt: string|null;
  source: 'provider_discovery'|'not_configured';
};
export type RepositoryQualityReadModel = {
  collectedAt: string|null;source:string;
  packages:{local:number|null;upstream:number|null;nameCollisions:number|null};
  findings:Array<{id:string;kind:string;severity:'info'|'warning'|'error';title:string;source:string}>;
  trends:Array<{bucket:string;errors:number;drifts:number;passed:number}>;
};
