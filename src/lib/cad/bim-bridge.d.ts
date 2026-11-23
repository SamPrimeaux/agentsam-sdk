import type {BimModel} from '@inneranimalmedia/agentsam-contracts/bim-model';
import type {CadProjectV2} from './project-v2.js';
export declare const cadIdForIfcGlobalId:(globalId:string)=>string;
export declare function projectFromIfcInspection(model:BimModel, options:{
  id:string; name?:string; sourceUri:string; revision?:number;
}): CadProjectV2;
