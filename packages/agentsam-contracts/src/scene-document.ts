/**
 * Cross-application IAMScene v2 authoring/runtime capability contract.
 * Describes what a provider actually implements, not what a schema can hold.
 * Specialist packages own execution and project persistence/authorization.
 */
export const AGENTSAM_SCENE_DOCUMENT_CONTRACT = 'agentsam.scene-document.v2' as const;
export const SCENE_DOCUMENT_OPERATIONS = [
  'create','validate','migrate','edit','render','simulate','execute-events','inspect',
] as const;
export type SceneDocumentOperation = typeof SCENE_DOCUMENT_OPERATIONS[number];
export type SceneDocumentAvailability = 'implemented' | 'unavailable';
export interface SceneDocumentCapability {
  contract: typeof AGENTSAM_SCENE_DOCUMENT_CONTRACT;
  schemaUri:string;
  format:'iamscene';
  formatVersion:'2.0.0';
  /** Each operation requires an actual provider binding, not a UI label. */
  operations:Readonly<Record<SceneDocumentOperation,SceneDocumentAvailability>>;
  /** Schema acceptance and executable runtime support are separate facts. */
  requirements:readonly string[];
  limitations:readonly string[];
}
export interface SceneDocumentOperationReceipt {
  contract:typeof AGENTSAM_SCENE_DOCUMENT_CONTRACT;
  operation:SceneDocumentOperation;
  status:'passed'|'failed'|'unavailable';
  inputHash?:string;
  outputHash?:string;
  preserved:readonly string[];
  lost:readonly string[];
  warnings:readonly string[];
}
const OPS = new Set<string>(SCENE_DOCUMENT_OPERATIONS);
const hash=/^[a-f0-9]{64}$/;
export function assertSceneDocumentCapability(value:unknown):asserts value is SceneDocumentCapability {
  const row=value as Partial<SceneDocumentCapability>|null;
  if(!row||typeof row!=='object'||Object.keys(row).some(k=>!['contract','schemaUri','format','formatVersion','operations','requirements','limitations'].includes(k))||
     row.contract!==AGENTSAM_SCENE_DOCUMENT_CONTRACT||row.format!=='iamscene'||row.formatVersion!=='2.0.0'||
     typeof row.schemaUri!=='string'||!row.schemaUri||!row.operations||typeof row.operations!=='object'||
     Object.keys(row.operations).length!==SCENE_DOCUMENT_OPERATIONS.length||
     SCENE_DOCUMENT_OPERATIONS.some(op=>!['implemented','unavailable'].includes(row.operations![op]))||
     !Array.isArray(row.requirements)||row.requirements.some(s=>typeof s!=='string')||
     !Array.isArray(row.limitations)||row.limitations.some(s=>typeof s!=='string'))
    throw new Error('agentsam_scene_document_capability_invalid');
}
export function assertSceneDocumentOperationReceipt(value:unknown):asserts value is SceneDocumentOperationReceipt {
  const row=value as Partial<SceneDocumentOperationReceipt>|null;
  if(!row||typeof row!=='object'||Object.keys(row).some(k=>!['contract','operation','status','inputHash','outputHash','preserved','lost','warnings'].includes(k))||
     row.contract!==AGENTSAM_SCENE_DOCUMENT_CONTRACT||!OPS.has(String(row.operation))||
     !['passed','failed','unavailable'].includes(String(row.status))||
     (row.inputHash!==undefined&&!hash.test(row.inputHash))||
     (row.outputHash!==undefined&&!hash.test(row.outputHash))||
     !Array.isArray(row.preserved)||!Array.isArray(row.lost)||!Array.isArray(row.warnings)||
     [...(row.preserved||[]),...(row.lost||[]),...(row.warnings||[])].some(v=>typeof v!=='string')||
     (row.status==='passed'&&row.lost.length>0)||
     (row.status==='unavailable'&&row.outputHash!==undefined))
    throw new Error('agentsam_scene_document_receipt_invalid');
}
