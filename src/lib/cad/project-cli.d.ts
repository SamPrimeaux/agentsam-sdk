export function localProjectRuntime(root?: string, onProjectChanged?: (row: any)=>void): {execute(name: string,args?: any): Promise<any>; catalog(): any[]; nativeDoctor(): Promise<{ready: boolean; engine: string; version?: string; reason?: string; binary?: string}>};
export function runProjectCli(args: string[]): Promise<void>;
