import type {CadProjectV2} from './project-v2.js';
export declare const CAD_DELIVERY_PROFILES: Readonly<Record<string,readonly (readonly [string,string,string])[]>>;
export declare function attachCadDeliveryProfiles(project:CadProjectV2,requestedProfiles:string[]):CadProjectV2;
export declare function inspectCadDeliveryReadiness(project:CadProjectV2,packageId:string):{
 packageId:string;readyForArtifactDelivery:boolean;missingOutputIds:string[];
 permitReady:false;sealed:false;professionalReviewRequired:boolean;
};
