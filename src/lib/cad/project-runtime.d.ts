export const CAD_PROJECT_TOOLS: any[];
export function createProjectRuntime(options: any): {execute(name: string,args?: any): Promise<any>;catalog(): any[]; nativeDoctor(): Promise<{ready: boolean; engine: string; version?: string; reason?: string}>};
