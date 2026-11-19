import type {
  AgentSourceFormatReference,
  AgentSourceKindReference,
  AgentSourceIdentificationResult,
} from '@inneranimalmedia/agentsam-contracts/source-types';

export type CadProjectDomain =
  | 'architecture.building' | 'mechanical.part' | 'mechanical.assembly'
  | 'product.design' | 'site.landscape' | 'general.cad';
export type CadUnit = 'in'|'mm'|'cm'|'m'|'ft';
export type CadOutputState = 'planned'|'queued'|'running'|'generated'|'validated'|'approved'|'stale'|'failed'|'blocked';
export interface CadGeometryEntity { id: string; kind: string; sourceGroup?: string; data?: Record<string,unknown>; parameters?: Record<string,unknown> }
export interface CadAsset {
  id: string;
  role: 'reference'|'source'|'derived'|'published';
  uri?: string;
  sha256?: string;
  status?: 'planned'|'available'|'restricted';
  mediaType?: string;
  sourceRevision?: number;
  sourceKindRef?: AgentSourceKindReference;
  formatRef?: AgentSourceFormatReference;
  formatDetection?: AgentSourceIdentificationResult;
  [key: string]: unknown;
}
export interface CadOutputArtifact {
  uri: string;
  sha256: string;
  formatRef?: AgentSourceFormatReference;
  mediaType?: string;
  extension?: string;
  byteSize?: number;
  [key: string]: unknown;
}
export interface CadOutput {
  id: string; kind: string; format: string; formatRef?: AgentSourceFormatReference; capability: string; state: CadOutputState;
  sourceRevision: number; dependencies: string[]; elementIds?: string[];
  artifact?: CadOutputArtifact; receiptId?: string;
  executor?: {provider:string; version:string}; professionalReviewRequired?: boolean;
}
export interface CadProjectV2 {
  schema: 'cad.project.v2'; id: string; name: string; domain: CadProjectDomain; revision: number;
  coordinateSystem: {unit:CadUnit; upAxis:'Z'; handedness:'right'; origin:[number,number,number]};
  geometry: {entities:CadGeometryEntity[];relationships:Array<{id:string;from:string;to:string;kind?:string}>;constraints:Record<string,unknown>[]};
  modules: Record<string,Record<string,unknown>>;
  intent: {references:unknown[]; decisions:unknown[]; assumptions:unknown[]};
  assets: CadAsset[];
  views:unknown[];sheets:unknown[];scenes:unknown[];productions:unknown[];
  outputs:CadOutput[];
  packages:Array<{id:string;profile:string;outputIds:string[];permitReady:false;sealed:false;state?:string;release?:string}>;
  receipts: Array<{id:string;outputId?:string;provider?:string;providerVersion?:string;sourceRevision?:number;artifactSha256?:string}>;
  revisions:unknown[];
  execution:{jobs:unknown[];providerPreferences:unknown[]};
  professionalReview:{permitReady:false;sealed:false;issues:unknown[];reviews:unknown[]};
  compatibility?: {sourceSchema:string;sourceDocument:Record<string,unknown>;migration:string;sourceScale?:number};
}
export declare const CAD_PROJECT_V2:'cad.project.v2';
export declare const CAD_DOMAINS:readonly CadProjectDomain[];
export declare const CAD_UNITS:readonly CadUnit[];
export declare function resolveCadDomainModule(domain:CadProjectDomain):string|null;
export declare function validateCadProjectV2(project:unknown):{valid:boolean;errors:string[]};
export declare function requireCadProjectV2(project:CadProjectV2):CadProjectV2;
export declare function createCadProjectV2(input:{
  id:string;name:string;domain:CadProjectDomain;unit?:CadUnit;revision?:number;
  geometry?:CadProjectV2['geometry'];modules?:CadProjectV2['modules'];
  compatibility?:CadProjectV2['compatibility'];
}):CadProjectV2;
export declare function convertCadCoordinate(value:number,fromUnit:CadUnit,toUnit:CadUnit):number;
export declare function normalizeCadV1(project:Record<string,unknown>):CadProjectV2;
export declare function restoreCadV1FromV2(project:CadProjectV2):Record<string,unknown>;
export declare function normalizeArchitecturalSource(source:Record<string,unknown>):CadProjectV2;
export declare function invalidateCadOutputs(project:CadProjectV2,changedElementIds:string[],nextRevision:number):{project:CadProjectV2;affectedOutputIds:string[]};
export declare function updateCadGeometryEntity(project:CadProjectV2,id:string,updatedData:Record<string,unknown>,nextRevision:number):{project:CadProjectV2;affectedOutputIds:string[]};
export declare function completeCadOutput(project:CadProjectV2,outputId:string,args:{
 artifact:CadOutputArtifact;receiptId:string;provider:string;providerVersion:string;
}):CadProjectV2;
