export function localProjectRuntime(root?: string, onProjectChanged?: (row: any)=>void): {execute(name: string,args?: any): Promise<any>; catalog(): any[]};
export function runProjectCli(args: string[]): Promise<void>;
