export declare const CAD_PRODUCTION_CAPABILITIES: ReadonlyArray<readonly [string,string,'read'|'write']>;
export declare function createCadProductionOperations(args:{
 provider:{execute:(operation:string,input:Record<string,unknown>,scope:unknown)=>Promise<unknown>};
 supportedOperationIds:string[];
 resolveTrustedContext:(ctx:unknown)=>Promise<unknown>;
 authorize:(ctx:unknown)=>Promise<boolean>;
 requestApproval:(ctx:unknown)=>Promise<boolean>;
}):unknown[];
