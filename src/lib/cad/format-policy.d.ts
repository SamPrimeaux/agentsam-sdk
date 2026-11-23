import type {AgentSourceFormatReference} from '@inneranimalmedia/agentsam-contracts/source-types';
export type CadSourceRole = 'native-bim'|'parametric'|'presentation'|'exchange'|'verification';
export declare const CAD_SOURCE_FORMATS: readonly {
  readonly id:string; readonly role:CadSourceRole; readonly extensions:readonly string[];
}[];
export declare function identifyCadFileFormat(filename:string): (AgentSourceFormatReference & {role:CadSourceRole}) | null;
export declare function cadOutputFormatReference(label:string): AgentSourceFormatReference | null;
