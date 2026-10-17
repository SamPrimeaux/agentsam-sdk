export type DiagnosticLogContext={
 id:string;source:"cloudflare-workers"|"ai-gateway"|"agentsam";
 service:string;timestamp:string;severity:"info"|"warn"|"error";message:string;
 requestId:string;rayId:string;route:string;status:number|null;durationMs:number|null;
 errorCode:string;provider:string;model:string;metadata:Record<string,string|number|boolean>;
};
export function redactDiagnosticText(value:unknown,max?:number):string;
export function normalizeDiagnosticLog(input:Partial<DiagnosticLogContext>&Record<string,unknown>):DiagnosticLogContext|null;
export function formatDiagnosticLog(log:Partial<DiagnosticLogContext>):string;
export function diagnosticContext(records:Partial<DiagnosticLogContext>[],scope?:{range?:string;level?:string;search?:string}):{
 surface:"analytics.health";context_type:"cloudflare.logs";
 range:string;filters:{level:string;search:string};selected_logs:DiagnosticLogContext[];source_note:string;
};
export const LOG_DIAGNOSTIC_LIMIT:number;
