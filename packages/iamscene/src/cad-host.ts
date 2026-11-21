/**
 * IAMScene's optional CAD building-service transport. The Python CAD service
 * owns its modeling engines and source file mounts. This client does not run
 * shell commands or require callers to provide SDK roots or a project ID.
 * A host must explicitly probe, install, and authorize this callable handler.
 */
import { createHash } from 'node:crypto';

export interface CadFileResourceRef { kind: 'file'; mount: string; path: string }
export interface CadBuildingRequest { source: CadFileResourceRef; base?: string }
export interface CadArtifactReceipt { path: string; bytes: number; sha256: string; uri: string }
export interface CadBuildingExportReceipt {
  ok: true;
  schema: 'agentsam.cad.building-export.v1';
  source: { source_sha256: string; source_revision: number; scope: string };
  output_scope: 'runtime-derived';
  job_id: string;
  files: CadArtifactReceipt[];
  receipt: { status: 'passed'; checks: Array<{ id: string; passed: boolean }> };
}
export type CadHostAvailability = { readiness: 'available' | 'unverified' | 'unavailable'; reason: string | null };
export interface CadBuildingHostHandler {
  (input: CadBuildingRequest): Promise<{ok: boolean; error?: string; result?: CadBuildingExportReceipt }>;
  probe(): Promise<CadHostAvailability>;
  availability(): CadHostAvailability;
  downloadArtifact(artifact: CadArtifactReceipt): Promise<Uint8Array>;
}

function validInput(input: CadBuildingRequest): boolean {
  const ref = input?.source;
  if (!ref || ref.kind !== 'file' || Object.keys(ref).some(k=>!['kind','mount','path'].includes(k)) ||
      !/^[a-z][a-z0-9_-]{0,39}$/.test(ref.mount) || typeof ref.path !== 'string' ||
      !ref.path || ref.path.length > 1024 || ref.path.startsWith('/') || ref.path.includes('\\') ||
      ref.path.includes('\0') || ref.path.split('/').some(v=>!v || v === '.' || v === '..') ||
      Object.keys(input).some(k=>!['source','base'].includes(k)) ||
      (input.base !== undefined && !/^[a-f0-9]{64}$/i.test(input.base))) return false;
  return true;
}
function responseHasEvidence(result: unknown): result is CadBuildingExportReceipt {
  const x = result as CadBuildingExportReceipt;
  return x?.ok === true && x.schema === 'agentsam.cad.building-export.v1' &&
    /^[a-f0-9]{64}$/.test(x.source?.source_sha256 ?? '') &&
    x.source?.scope === 'single_rectangular_shell_with_north_south_openings' &&
    x.output_scope === 'runtime-derived' &&
    typeof x.job_id === 'string' && x.job_id.length > 0 &&
    Array.isArray(x.files) && x.files.length >= 9 &&
    ['shell.step','shell.ifc','plan.dxf','plan.svg','preview.png','sheet-A101-proof.pdf','model.glb','model.opt.glb','turntable.mp4'].every(name=>x.files.some(f=>f.path===name)) &&
    x.files.every(f=>typeof f.uri === 'string' && /^\/v1\/files\/work\/derived\/building-[a-zA-Z0-9_-]+\/[^/?]+$/.test(f.uri) &&
      /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.bytes) && f.bytes > 0 && f.bytes <= 25*1024*1024) &&
    x.receipt?.status === 'passed' && Array.isArray(x.receipt.checks) &&
    x.receipt.checks.length >= 16 && x.receipt.checks.every(c=>c.passed === true);
}

export function createIAMSceneCadBuildingHost({ endpoint, token, fetchImpl = fetch, allowInternalHttp = false }: {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** Explicit host opt-in for a private plaintext service-binding network. */
  allowInternalHttp?: boolean;
}): CadBuildingHostHandler {
  const address = new URL(endpoint);
  if (address.username || address.password || address.search || address.hash ||
    !['http:','https:'].includes(address.protocol) ||
    (address.protocol === 'http:' && !allowInternalHttp && !['localhost','127.0.0.1','[::1]'].includes(address.hostname)))
    throw new Error('iamscene_cad_host_endpoint_invalid');
  if (typeof token !== 'string' || token.length < 16) throw new Error('iamscene_cad_host_token_required');
  const base = address.origin + address.pathname.replace(/\/+$/, '');
  const headers = { 'Authorization': `Bearer ${token}` };
  let state: CadHostAvailability = { readiness:'unverified', reason:'host_not_probed' };

  async function probe(): Promise<CadHostAvailability> {
    try {
      const response = await fetchImpl(base + '/v1/capabilities', {headers,signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error('cad_host_probe_http_' + response.status);
      const evidence = await response.json() as Record<string, any>;
      const endpointStatus = evidence?.endpoints?.cad_building_export;
      const tools = evidence?.tools || {};
      const required = ['freecad','occt','ifc','blender','media'];
      const ready = endpointStatus?.handler_installed === true &&
        endpointStatus?.operation === 'cad.building.export' &&
        endpointStatus?.scope === 'single_rectangular_shell_with_north_south_openings' &&
        required.every(key => tools[key]?.installed === true && tools[key]?.ready !== false);
      state = ready ? {readiness:'available',reason:null} : {readiness:'unavailable',reason:'cad_required_engine_unavailable'};
    } catch {
      state = {readiness:'unavailable',reason:'cad_host_probe_failed'};
    }
    return {...state};
  }
  function availability(): CadHostAvailability { return {...state}; }
  const invoke = (async(input: CadBuildingRequest) => {
    if (state.readiness !== 'available') return {ok:false,error:'cad_host_unavailable_or_unprobed'};
    if (!validInput(input)) return {ok:false,error:'cad_building_resource_ref_invalid'};
    try {
      const response = await fetchImpl(base + '/v1/cad/building/export', {
        method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify(input),signal:AbortSignal.timeout(135000),
      });
      const result = await response.json() as unknown;
      if (!response.ok) return {ok:false,error:(result as any)?.error || 'cad_building_export_http_'+response.status};
      if (!responseHasEvidence(result) || (input.base && result.source.source_sha256 !== input.base.toLowerCase()))
        return {ok:false,error:'cad_building_receipt_verification_failed'};
      return {ok:true,result};
    } catch {return {ok:false,error:'cad_building_transport_failed'};}
  }) as CadBuildingHostHandler;
  invoke.probe = probe;
  invoke.availability = availability;
  invoke.downloadArtifact = async(artifact: CadArtifactReceipt): Promise<Uint8Array> => {
    if (state.readiness !== 'available' || !/^\/v1\/files\/work\/derived\/building-[a-zA-Z0-9_-]+\/[^/?]+$/.test(artifact.uri))
      throw new Error('cad_building_artifact_reference_invalid');
    const response = await fetchImpl(base + artifact.uri,{headers,signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('cad_building_artifact_read_failed');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
      throw new Error('cad_building_artifact_integrity_invalid');
    return bytes;
  };
  return invoke;
}
