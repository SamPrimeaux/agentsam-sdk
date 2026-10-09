import { terminalExec } from './terminal-exec.js';
/** Intentional npm script execution with per-call host authorization. */
export function testRun(input={},projectRoot) {
 const script=typeof input.script==='string'&&/^[A-Za-z0-9:_-]+$/.test(input.script)?input.script:'test';
 return terminalExec({
   cwd:projectRoot,relative_cwd:input.relative_cwd||'',
   command:'npm',args:['run',script,'--',...(Array.isArray(input.args)?input.args:[])],
   timeout_ms:input.timeout_ms||120000,max_output_bytes:input.max_output_bytes||262144
 },{cwd:projectRoot});
}
